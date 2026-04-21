/**
 * GET    /api/vault/files/:id   — metadata + decrypted download URL (owner only)
 * DELETE /api/vault/files/:id   — remove from Blob storage + soft-delete row.
 *                                  Blocked under folder legal hold.
 *
 * The stored URL is encrypted with the folder's DEK, so a DB-only read
 * does not leak file URLs — they decrypt only under an authenticated
 * owner request here.
 */

'use strict';

const { authenticate, cors } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { unwrapFolderKey, decryptField } = require('../../../services/vault/encryption');
const storage = require('../../../services/vault/storage');
const audit = require('../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available.' });
  }

  const fileId = parseInt(req.query.id, 10);
  if (!Number.isInteger(fileId) || fileId <= 0) {
    return res.status(400).json({ error: 'Invalid file id' });
  }

  try {
    const row = await getOne(
      `SELECT vf.id, vf.entry_id, vf.folder_id, vf.uploader_user_id,
              vf.storage_key, vf.mime_type, vf.byte_size, vf.checksum_sha256,
              vf.filename_enc, vf.deleted_at, vf.created_at,
              f.owner_user_id AS folder_owner, f.legal_hold AS folder_legal_hold,
              f.dek_wrapped, f.dek_iv, f.dek_tag
       FROM vault_files vf
       JOIN vault_folders f ON f.id = vf.folder_id
       WHERE vf.id = $1`,
      [fileId]
    );
    if (!row || row.folder_owner !== user.id) {
      return res.status(404).json({ error: 'File not found' });
    }

    if (req.method === 'GET') return handleGet(req, res, user, row);
    if (req.method === 'DELETE') return handleDelete(req, res, user, row);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/files/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function handleGet(req, res, user, row) {
  if (row.deleted_at) return res.status(410).json({ error: 'File has been deleted' });

  const dek = unwrapFolderKey(row);
  let filename, downloadUrl;
  try {
    filename = row.filename_enc ? decryptField(dek, row.filename_enc) : null;
    downloadUrl = row.storage_key ? decryptField(dek, row.storage_key) : null;
  } finally {
    dek.fill(0);
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.FILE_DOWNLOAD,
    target_type: 'file',
    target_id: row.id,
    folder_id: row.folder_id,
    metadata: { mime_type: row.mime_type },
  });

  return res.status(200).json({
    file: {
      id: String(row.id),
      folder_id: String(row.folder_id),
      entry_id: row.entry_id ? String(row.entry_id) : null,
      filename: filename,
      mime_type: row.mime_type,
      byte_size: Number(row.byte_size),
      checksum_sha256: row.checksum_sha256,
      download_url: downloadUrl,
      created_at: row.created_at,
    },
  });
}

async function handleDelete(req, res, user, row) {
  if (row.deleted_at) return res.status(410).json({ error: 'File already deleted' });
  if (row.folder_legal_hold) {
    return res.status(409).json({ error: 'This file is under legal hold and cannot be deleted.' });
  }

  // Decrypt the blob URL to pass to the storage adapter for removal.
  const dek = unwrapFolderKey(row);
  let blobUrl;
  try {
    blobUrl = row.storage_key ? decryptField(dek, row.storage_key) : null;
  } finally {
    dek.fill(0);
  }

  // Remove from blob storage first; if that fails we still soft-delete
  // the row so the user's UI updates. Orphaned blobs can be reaped by a
  // separate cron (V2).
  if (blobUrl) {
    try { await storage.removeBlob(blobUrl); }
    catch (e) { console.warn('[vault/files] blob removal failed:', e && e.message); }
  }

  await run(
    `UPDATE vault_files SET deleted_at = NOW(), storage_key = NULL
     WHERE id = $1`,
    [row.id]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.FILE_DELETE,
    target_type: 'file',
    target_id: row.id,
    folder_id: row.folder_id,
  });

  return res.status(200).json({ ok: true });
}
