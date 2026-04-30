/**
 * GET  /api/vault/entries?folder_id=X[&sort=event|logged&dir=asc|desc&include_deleted=0|1]
 *   List entries in a folder for the timeline view. Decrypted per request.
 *
 * POST /api/vault/entries
 *   Body: { folder_id, entry_type, content?, event_at?, location?, tags? }
 *   Create a new entry. For media types (photo/screenshot/document/audio)
 *   the entry is created here; the file attachment lands via the separate
 *   upload endpoint in slice 4.
 *
 * Ownership: folder membership IS the ownership boundary. We look up the
 * folder first, confirm owner_user_id = caller, then use the folder's DEK
 * for every encrypt/decrypt in the request. Cross-folder leakage blocked
 * by requiring folder_id on list and joining against vault_folders on write.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');
const { unwrapFolderKey, encryptField, decryptField } = require('../../services/vault/encryption');
const audit = require('../../services/vault/audit');
const H = require('../../services/vault/entry-helpers');
const { blockIfNotPlus } = require('../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  try {
    if (req.method === 'GET') return handleList(req, res, user);
    if (req.method === 'POST') return handleCreate(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/entries] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function handleList(req, res, user) {
  const folderId = parseInt(req.query.folder_id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'folder_id query param required' });
  }

  const sort = req.query.sort === 'logged' ? 'logged_at' : 'event_at';
  const dir = (req.query.dir === 'asc') ? 'ASC' : 'DESC';
  const includeDeleted = req.query.include_deleted === 'true' || req.query.include_deleted === '1';

  const folder = await getOne(
    `SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag
     FROM vault_folders
     WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  // NULLS LAST on DESC reads as "dated entries first, undated at the end"
  const nullsClause = dir === 'DESC' ? 'NULLS LAST' : 'NULLS FIRST';
  const orderSql =
    sort === 'logged_at'
      ? `logged_at ${dir}`
      : `event_at ${dir} ${nullsClause}, logged_at ${dir}`;
  const deletedClause = includeDeleted ? '' : 'AND deleted_at IS NULL';

  const rows = await getMany(
    `SELECT id, entry_type, logged_at, event_at, location_enc, content_enc,
            ai_status, ai_confidence, ai_summary_enc, ai_dates_enc,
            tags, legal_hold, deleted_at, created_at, updated_at
     FROM vault_entries
     WHERE folder_id = $1 ${deletedClause}
     ORDER BY ${orderSql}`,
    [folderId]
  );

  // Pull all attached files for this folder in a single query. Decrypt
  // their storage_key + filename under the folder DEK alongside the
  // entries so the timeline can render media inline without N+1 fetches.
  // (Per-file downloads are still audited when the user opens a file
  // via GET /api/vault/files/:id — this endpoint logs a single ENTRY_LIST
  // at the folder level.)
  const fileRows = await getMany(
    `SELECT id, entry_id, storage_key, mime_type, byte_size, filename_enc, created_at
     FROM vault_files
     WHERE folder_id = $1 AND deleted_at IS NULL AND entry_id IS NOT NULL
     ORDER BY created_at ASC`,
    [folderId]
  );

  const dek = unwrapFolderKey(folder);
  let entries;
  try {
    // Index files by entry_id, decrypting under DEK.
    const filesByEntry = {};
    for (const fr of fileRows) {
      const eid = String(fr.entry_id);
      if (!filesByEntry[eid]) filesByEntry[eid] = [];
      let filename = null, url = null;
      try { if (fr.filename_enc) filename = decryptField(dek, fr.filename_enc); } catch (_) {}
      try { if (fr.storage_key) url = decryptField(dek, fr.storage_key); } catch (_) {}
      filesByEntry[eid].push({
        id: String(fr.id),
        filename: filename,
        mime_type: fr.mime_type,
        byte_size: Number(fr.byte_size),
        download_url: url,
        created_at: fr.created_at,
      });
    }

    entries = rows.map(function (row) {
      return {
        id: String(row.id),
        folder_id: String(folderId),
        entry_type: row.entry_type,
        content: row.content_enc ? decryptField(dek, row.content_enc) : null,
        location: H.decryptLocation(dek, row.location_enc),
        event_at: row.event_at,
        logged_at: row.logged_at,
        tags: row.tags || [],
        ai_status: row.ai_status,
        ai_confidence: row.ai_confidence !== null ? Number(row.ai_confidence) : null,
        ai_summary: row.ai_summary_enc ? decryptField(dek, row.ai_summary_enc) : null,
        ai_dates: row.ai_dates_enc ? H.safeJsonParse(decryptField(dek, row.ai_dates_enc)) : null,
        legal_hold: !!row.legal_hold,
        deleted: !!row.deleted_at,
        created_at: row.created_at,
        updated_at: row.updated_at,
        files: filesByEntry[String(row.id)] || [],
      };
    });
  } finally {
    dek.fill(0);
  }

  return res.status(200).json({ entries, sort, dir });
}

async function handleCreate(req, res, user) {
  const body = (await parseBody(req)) || {};
  const folderId = parseInt(body.folder_id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'folder_id is required' });
  }

  const entryType = typeof body.entry_type === 'string' ? body.entry_type : '';
  if (H.ENTRY_TYPES.indexOf(entryType) === -1) {
    return res.status(400).json({ error: `entry_type must be one of: ${H.ENTRY_TYPES.join(', ')}` });
  }

  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (entryType === 'note' && !content) {
    return res.status(400).json({ error: 'Content is required for note entries' });
  }
  if (content.length > H.MAX_CONTENT_LEN) {
    return res.status(400).json({ error: `Content exceeds ${H.MAX_CONTENT_LEN} characters` });
  }

  const eventAt = H.parseOptionalTimestamp(body.event_at);
  if (body.event_at && !eventAt) {
    return res.status(400).json({ error: 'event_at must be an ISO-8601 timestamp' });
  }

  const location = H.sanitizeLocation(body.location);
  const tags = H.sanitizeTags(body.tags);
  if (tags === null) {
    return res.status(400).json({ error: `Invalid tags. Max ${H.MAX_TAGS} tags, lowercase alphanumeric + _ -, up to ${H.MAX_TAG_LEN} chars each.` });
  }

  const folder = await getOne(
    `SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag, legal_hold
     FROM vault_folders
     WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Folder not found' });
  }
  if (folder.legal_hold) {
    return res.status(409).json({ error: 'Folder is under legal hold. New entries are blocked until the hold is released.' });
  }

  const dek = unwrapFolderKey(folder);
  let inserted;
  try {
    const contentEnc = content ? encryptField(dek, content) : null;
    const locationEnc = location ? encryptField(dek, JSON.stringify(location)) : null;
    inserted = await getOne(
      `INSERT INTO vault_entries
        (folder_id, owner_user_id, entry_type, content_enc, location_enc,
         event_at, tags)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, logged_at, created_at, updated_at, ai_status`,
      [folderId, user.id, entryType, contentEnc, locationEnc, eventAt, tags]
    );
  } finally {
    dek.fill(0);
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.ENTRY_CREATE,
    target_type: 'entry',
    target_id: inserted.id,
    folder_id: folderId,
    metadata: { entry_type: entryType, has_content: !!content, has_location: !!location, tag_count: tags.length },
  });

  return res.status(201).json({
    entry: {
      id: String(inserted.id),
      folder_id: String(folderId),
      entry_type: entryType,
      content: content || null,
      location: location,
      event_at: eventAt,
      logged_at: inserted.logged_at,
      tags: tags,
      ai_status: inserted.ai_status,
      ai_confidence: null,
      ai_summary: null,
      ai_dates: null,
      legal_hold: false,
      deleted: false,
      created_at: inserted.created_at,
      updated_at: inserted.updated_at,
    },
  });
}
