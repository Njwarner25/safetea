/**
 * GET    /api/vault/folders/:id   — fetch a single folder (owner-only)
 * PATCH  /api/vault/folders/:id   — update title/description/AI flag/release settings
 * DELETE /api/vault/folders/:id   — soft delete (archive). Blocked under legal hold.
 *
 * Ownership: every route checks owner_user_id = caller's user.id. No admin
 * path here — break-glass lives in a separate endpoint (slice 11).
 *
 * Legal hold: if folder.legal_hold = true, DELETE returns 409. PATCH still
 * allows content updates (owner can still journal) but blocks setting the
 * flag itself — only admin break-glass can release a hold.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, getMany, run } = require('../../_utils/db');
const {
  unwrapFolderKey,
  encryptField,
  decryptField,
} = require('../../../services/vault/encryption');
const audit = require('../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../services/vault/gating');

const MAX_TITLE_LEN = 200;
const MAX_DESC_LEN = 2000;
const MIN_COUNTDOWN_HOURS = 1;
const MAX_COUNTDOWN_HOURS = 168;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  const folderId = parseInt(req.query.id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'Invalid folder id' });
  }

  try {
    const row = await getOne(
      `SELECT id, owner_user_id, title_enc, description_enc,
              dek_wrapped, dek_iv, dek_tag,
              archived, legal_hold, ai_enabled,
              emergency_release_settings, created_at, updated_at
       FROM vault_folders
       WHERE id = $1`,
      [folderId]
    );
    if (!row) return res.status(404).json({ error: 'Folder not found' });
    if (row.owner_user_id !== user.id) return res.status(404).json({ error: 'Folder not found' });

    if (req.method === 'GET') return handleGet(req, res, user, row);
    if (req.method === 'PATCH') return handlePatch(req, res, user, row);
    if (req.method === 'DELETE') return handleDelete(req, res, user, row);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/folders/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------

async function handleGet(req, res, user, row) {
  const dek = unwrapFolderKey(row);
  let title, description;
  try {
    title = decryptField(dek, row.title_enc);
    description = row.description_enc ? decryptField(dek, row.description_enc) : null;
  } finally {
    dek.fill(0);
  }

  const counts = await getOne(
    `SELECT
       (SELECT COUNT(*) FROM vault_entries e WHERE e.folder_id = $1 AND e.deleted_at IS NULL) AS entry_count,
       (SELECT COUNT(*) FROM vault_files vf WHERE vf.folder_id = $1 AND vf.deleted_at IS NULL) AS file_count`,
    [row.id]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.FOLDER_VIEW,
    target_type: 'folder',
    target_id: row.id,
    folder_id: row.id,
  });

  return res.status(200).json({
    folder: {
      id: String(row.id),
      title: title,
      description: description,
      archived: !!row.archived,
      legal_hold: !!row.legal_hold,
      ai_enabled: !!row.ai_enabled,
      emergency_release_settings: row.emergency_release_settings || {},
      entry_count: Number(counts && counts.entry_count) || 0,
      file_count: Number(counts && counts.file_count) || 0,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  });
}

// ---------------------------------------------------------------------------

async function handlePatch(req, res, user, row) {
  const body = (await parseBody(req)) || {};
  const hasTitle = typeof body.title === 'string';
  const hasDesc = typeof body.description === 'string';
  const hasAi = typeof body.ai_enabled === 'boolean';
  const hasSettings = body.emergency_release_settings && typeof body.emergency_release_settings === 'object';
  const hasArchived = typeof body.archived === 'boolean';

  if (!hasTitle && !hasDesc && !hasAi && !hasSettings && !hasArchived) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  // Owners cannot toggle legal_hold themselves — that's an admin-only gate.
  if (Object.prototype.hasOwnProperty.call(body, 'legal_hold')) {
    return res.status(403).json({ error: 'Legal hold can only be set or released by SafeTea administration.' });
  }

  // Normalize + validate
  const title = hasTitle ? body.title.trim() : null;
  const description = hasDesc ? body.description.trim() : null;

  if (title !== null && title.length === 0) return res.status(400).json({ error: 'Title cannot be empty' });
  if (title !== null && title.length > MAX_TITLE_LEN) return res.status(400).json({ error: `Title exceeds ${MAX_TITLE_LEN} characters` });
  if (description !== null && description.length > MAX_DESC_LEN) return res.status(400).json({ error: `Description exceeds ${MAX_DESC_LEN} characters` });

  // If we need to re-encrypt, unwrap the folder's DEK.
  let titleEnc = null;
  let descEnc = null;
  if (hasTitle || hasDesc) {
    const dek = unwrapFolderKey(row);
    try {
      if (hasTitle) titleEnc = encryptField(dek, title);
      if (hasDesc) descEnc = description ? encryptField(dek, description) : null;
    } finally {
      dek.fill(0);
    }
  }

  const settings = hasSettings ? sanitizeReleaseSettings(body.emergency_release_settings) : null;

  await run(
    `UPDATE vault_folders SET
       title_enc = COALESCE($2, title_enc),
       description_enc = CASE
         WHEN $3::boolean THEN $4
         ELSE description_enc
       END,
       ai_enabled = COALESCE($5, ai_enabled),
       emergency_release_settings = CASE
         WHEN $6::boolean THEN $7::jsonb
         ELSE emergency_release_settings
       END,
       archived = COALESCE($8, archived),
       updated_at = NOW()
     WHERE id = $1 AND owner_user_id = $9`,
    [
      row.id,
      titleEnc,
      hasDesc,
      descEnc,
      hasAi ? body.ai_enabled : null,
      hasSettings,
      settings ? JSON.stringify(settings) : null,
      hasArchived ? body.archived : null,
      user.id,
    ]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: hasArchived && body.archived ? audit.ACTIONS.FOLDER_ARCHIVE : audit.ACTIONS.FOLDER_UPDATE,
    target_type: 'folder',
    target_id: row.id,
    folder_id: row.id,
    metadata: {
      fields: {
        title: hasTitle,
        description: hasDesc,
        ai_enabled: hasAi,
        emergency_release_settings: hasSettings,
        archived: hasArchived,
      },
    },
  });

  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------

async function handleDelete(req, res, user, row) {
  if (row.legal_hold) {
    return res.status(409).json({
      error: 'This folder is under legal hold and cannot be deleted. Contact support@getsafetea.app.',
    });
  }

  // V1 = soft delete via archive flag. Hard-delete + cascade to entries/files
  // lives in a dedicated V2 flow that also purges object storage.
  await run(
    `UPDATE vault_folders SET archived = true, updated_at = NOW()
     WHERE id = $1 AND owner_user_id = $2 AND legal_hold = false`,
    [row.id, user.id]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.FOLDER_DELETE,
    target_type: 'folder',
    target_id: row.id,
    folder_id: row.id,
    metadata: { soft_delete: true },
  });

  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------

function sanitizeReleaseSettings(raw) {
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
