/**
 * POST /api/vault/assistant/chat
 *   Body: { folder_id, message }
 * GET  /api/vault/assistant/chat?folder_id=X
 *   Returns decrypted history (most recent last).
 *
 * Feature-flagged by VAULT_ASSISTANT_ENABLED. Ships dark by default —
 * practitioner review must complete before flipping the flag in prod.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, getMany, run } = require('../../_utils/db');
const { unwrapFolderKey, encryptField, decryptField } = require('../../../services/vault/encryption');
const assistant = require('../../../services/vault/assistant');
const audit = require('../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../services/vault/gating');

const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_RETURN = 50;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });
  if (!assistant.isEnabled()) {
    // Spec: while the system prompt is pending practitioner review, the
    // flag stays off and this endpoint returns 503. The UI should hide
    // the chat widget when it sees this.
    return res.status(503).json({ error: 'Journaling Assistant is currently disabled.' });
  }

  try {
    if (req.method === 'GET') return handleHistory(req, res, user);
    if (req.method === 'POST') return handleChat(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/assistant/chat] fatal:', err);
    return res.status(500).json({ error: 'Server error', details: err && err.message });
  }
};

async function handleHistory(req, res, user) {
  const folderId = parseInt(req.query.folder_id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'folder_id required' });

  const folder = await getOne(
    `SELECT id, owner_user_id, ai_enabled, dek_wrapped, dek_iv, dek_tag
     FROM vault_folders WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== user.id) return res.status(404).json({ error: 'Folder not found' });
  if (!folder.ai_enabled) return res.status(200).json({ messages: [], ai_disabled_on_folder: true });

  const rows = await getMany(
    `SELECT id, role, content_enc, created_at
     FROM vault_assistant_messages
     WHERE folder_id = $1
     ORDER BY created_at ASC
     LIMIT $2`,
    [folderId, MAX_HISTORY_RETURN]
  );

  const dek = unwrapFolderKey(folder);
  let messages;
  try {
    messages = rows.map(function (r) {
      return {
        id: String(r.id),
        role: r.role,
        content: r.content_enc ? decryptField(dek, r.content_enc) : '',
        created_at: r.created_at,
      };
    });
  } finally {
    dek.fill(0);
  }

  return res.status(200).json({ messages });
}

async function handleChat(req, res, user) {
  const body = (await parseBody(req)) || {};
  const folderId = parseInt(body.folder_id, 10);
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'folder_id required' });
  if (!message) return res.status(400).json({ error: 'message required' });
  if (message.length > MAX_MESSAGE_LEN) return res.status(400).json({ error: `message too long (max ${MAX_MESSAGE_LEN})` });

  const folder = await getOne(
    `SELECT id, owner_user_id, ai_enabled, dek_wrapped, dek_iv, dek_tag
     FROM vault_folders WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== user.id) return res.status(404).json({ error: 'Folder not found' });
  if (!folder.ai_enabled) return res.status(403).json({ error: 'AI is not enabled on this folder' });

  // Load recent history for continuity (decrypt in a tight scope).
  const historyRows = await getMany(
    `SELECT role, content_enc FROM vault_assistant_messages
     WHERE folder_id = $1
     ORDER BY created_at DESC
     LIMIT 20`,
    [folderId]
  );

  const dek = unwrapFolderKey(folder);
  let reply, surfaced;
  try {
    // Oldest-first for the model
    const history = historyRows
      .map(function (r) { return { role: r.role, content: r.content_enc ? decryptField(dek, r.content_enc) : '' }; })
      .reverse();

    // Persist the user turn first (so if the model call fails we still have it).
    await run(
      `INSERT INTO vault_assistant_messages (folder_id, owner_user_id, role, content_enc)
       VALUES ($1, $2, 'user', $3)`,
      [folderId, user.id, encryptField(dek, message)]
    );

    const result = await assistant.respond({
      userId: user.id,
      folderId: folderId,
      history: history,
      userMessage: message,
    });
    reply = result.reply;
    surfaced = result.resources_surfaced || [];

    await run(
      `INSERT INTO vault_assistant_messages
         (folder_id, owner_user_id, role, content_enc, resources_surfaced)
       VALUES ($1, $2, 'assistant', $3, $4)`,
      [folderId, user.id, encryptField(dek, reply), surfaced]
    );
  } finally {
    dek.fill(0);
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.AI_ASSIST,
    target_type: 'folder',
    target_id: folderId,
    folder_id: folderId,
    metadata: {
      resources_surfaced: surfaced,
      message_chars: message.length,
    },
  });

  return res.status(200).json({ reply: reply, resources_surfaced: surfaced });
}
