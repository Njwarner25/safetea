/**
 * POST /api/vault/folders    — create a new vault folder
 * GET  /api/vault/folders    — list the caller's folders (decrypted for owner)
 *
 * Auth: Bearer token; only the owner can ever see their own folders. No
 * admin read path here — break-glass is a separate flow (slice 11).
 *
 * Encryption: every folder has its own DEK. On create we generate one,
 * wrap it with VAULT_KEK, encrypt title + description with the plaintext
 * DEK (held in memory only), persist the wrapped form + ciphertexts, and
 * drop the plaintext DEK when the handler returns.
 *
 * Audit: every create / list writes a vault_audit_log row via the
 * services/vault/audit helper.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getMany, getOne, run } = require('../_utils/db');
const {
  createFolderKey,
  unwrapFolderKey,
  encryptField,
  decryptField,
} = require('../../services/vault/encryption');
const audit = require('../../services/vault/audit');

// Guardrails on user input
const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 2000;
const MIN_COUNTDOWN_HOURS = 1;
const MAX_COUNTDOWN_HOURS = 168; // 7 days

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Fail-closed: no vault operations without a configured KEK.
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  try {
    if (req.method === 'GET') return handleList(req, res, user);
    if (req.method === 'POST') return handleCreate(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/folders] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------
// GET /api/vault/folders
// ---------------------------------------------------------------------------
async function handleList(req, res, user) {
  const includeArchived = req.query.archived === 'true' || req.query.archived === '1';

  const rows = await getMany(
    `SELECT
       f.id, f.archived, f.legal_hold, f.ai_enabled,
       f.emergency_release_settings, f.created_at, f.updated_at,
       f.title_enc, f.description_enc,
       f.dek_wrapped, f.dek_iv, f.dek_tag,
       (SELECT COUNT(*) FROM vault_entries e WHERE e.folder_id = f.id AND e.deleted_at IS NULL) AS entry_count,
       (SELECT COUNT(*) FROM vault_files vf WHERE vf.folder_id = f.id AND vf.deleted_at IS NULL) AS file_count
     FROM vault_folders f
     WHERE f.owner_user_id = $1 ${includeArchived ? '' : 'AND f.archived = false'}
     ORDER BY f.updated_at DESC`,
    [user.id]
  );

  // Decrypt per-folder. Never returns ciphertexts or wrapped-DEK bytes to
  // the client — those never leave the server.
  const folders = rows.map(function (row) {
    const dek = unwrapFolderKey(row);
    try {
      return {
        id: String(row.id),
        title: decryptField(dek, row.title_enc),
        description: row.description_enc ? decryptField(dek, row.description_enc) : null,
        archived: !!row.archived,
        legal_hold: !!row.legal_hold,
        ai_enabled: !!row.ai_enabled,
        emergency_release_settings: row.emergency_release_settings || {},
        entry_count: Number(row.entry_count) || 0,
        file_count: Number(row.file_count) || 0,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
    } finally {
      dek.fill(0); // best-effort zeroize
    }
  });

  return res.status(200).json({ folders });
}

// ---------------------------------------------------------------------------
// POST /api/vault/folders
// ---------------------------------------------------------------------------
async function handleCreate(req, res, user) {
  const body = await parseBody(req);
  const title = (body && typeof body.title === 'string') ? body.title.trim() : '';
  const description = (body && typeof body.description === 'string') ? body.description.trim() : '';
  const aiEnabled = body && body.ai_enabled === true;
  const settings = sanitizeReleaseSettings(body && body.emergency_release_settings);

  if (!title) return res.status(400).json({ error: 'Title is required' });
  if (title.length > MAX_TITLE_LEN) return res.status(400).json({ error: `Title exceeds ${MAX_TITLE_LEN} characters` });
  if (description.length > MAX_DESC_LEN) return res.status(400).json({ error: `Description exceeds ${MAX_DESC_LEN} characters` });

  // Generate DEK, encrypt fields, persist.
  const key = createFolderKey();
  let inserted;
  try {
    const titleEnc = encryptField(key.dek, title);
    const descEnc = description ? encryptField(key.dek, description) : null;

    inserted = await getOne(
      `INSERT INTO vault_folders
        (owner_user_id, title_enc, description_enc, dek_wrapped, dek_iv, dek_tag,
         ai_enabled, emergency_release_settings)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb)
       RETURNING id, archived, legal_hold, ai_enabled,
                 emergency_release_settings, created_at, updated_at`,
      [
        user.id,
        titleEnc,
        descEnc,
        key.dek_wrapped,
        key.dek_iv,
        key.dek_tag,
        aiEnabled,
        JSON.stringify(settings),
      ]
    );
  } finally {
    key.dek.fill(0); // drop plaintext DEK as soon as we're done with it
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.FOLDER_CREATE,
    target_type: 'folder',
    target_id: inserted.id,
    folder_id: inserted.id,
    metadata: { ai_enabled: aiEnabled, has_description: !!description },
  });

  return res.status(201).json({
    folder: {
      id: String(inserted.id),
      title: title,
      description: description || null,
      archived: !!inserted.archived,
      legal_hold: !!inserted.legal_hold,
      ai_enabled: !!inserted.ai_enabled,
      emergency_release_settings: inserted.emergency_release_settings || {},
      entry_count: 0,
      file_count: 0,
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
    },
  });
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Defend against arbitrary JSON being stored in emergency_release_settings.
 * Only known keys survive sanitization.
 */
function sanitizeReleaseSettings(raw) {
  if (!raw || typeof raw !== 'object') return {};
  const out = {};
  if (typeof raw.auto_release_on_timeout === 'boolean') {
    out.auto_release_on_timeout = raw.auto_release_on_timeout;
  }
  if (Number.isInteger(raw.countdown_hours)) {
    out.countdown_hours = Math.max(MIN_COUNTDOWN_HOURS, Math.min(MAX_COUNTDOWN_HOURS, raw.countdown_hours));
  }
  if (Array.isArray(raw.allowed_contact_ids)) {
    out.allowed_contact_ids = raw.allowed_contact_ids
      .map(function (v) { return parseInt(v, 10); })
      .filter(function (v) { return Number.isInteger(v) && v > 0; });
  }
  return out;
}
