/**
 * POST /api/vault/files/commit
 *
 * Client-driven completion path. Called by the browser right after
 * @vercel/blob/client's upload() returns the blob URL — so the
 * vault_files row is inserted synchronously instead of waiting for
 * Vercel Blob's async onUploadCompleted callback (which in practice
 * can lag or silently fail).
 *
 * The onUploadCompleted path in upload.js still exists; if it arrives
 * later, the duplicate-detection (same storage_key encrypted under
 * the same folder DEK) keeps us idempotent.
 *
 * Body: {
 *   folder_id, entry_id, blob_url, pathname?,
 *   filename, mime_type, byte_size
 * }
 * Auth required (SafeTea+ gated — blockIfNotPlus).
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { encryptField, unwrapFolderKey, fileChecksum } = require('../../../services/vault/encryption');
const audit = require('../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../services/vault/gating');

const ALLOWED_MIME = new Set([
  'image/jpeg','image/png','image/heic','image/heif','image/webp',
  'application/pdf',
  'audio/m4a','audio/mpeg','audio/mp3','audio/wav','audio/webm','audio/aac','audio/ogg',
  'video/mp4','video/webm','video/quicktime','video/x-m4v',
]);
const MAX_BYTES = 25 * 1024 * 1024;

function isVercelBlobUrl(url) {
  try {
    const u = new URL(url);
    return /\.blob\.vercel-storage\.com$/i.test(u.hostname) || /\.public\.blob\.vercel-storage\.com$/i.test(u.hostname);
  } catch (_) { return false; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;

  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  try {
    const body = (await parseBody(req)) || {};
    const folderId = parseInt(body.folder_id, 10);
    const entryId = body.entry_id != null ? parseInt(body.entry_id, 10) : null;
    const blobUrl = typeof body.blob_url === 'string' ? body.blob_url : '';
    const filename = typeof body.filename === 'string' ? body.filename : 'attachment';
    const mime = typeof body.mime_type === 'string' ? body.mime_type.toLowerCase() : '';
    const byteSize = Number(body.byte_size);

    if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'folder_id required' });
    if (!blobUrl || !isVercelBlobUrl(blobUrl)) return res.status(400).json({ error: 'Invalid blob_url' });
    if (!ALLOWED_MIME.has(mime)) return res.status(400).json({ error: 'Content-Type ' + mime + ' not allowed' });
    if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) {
      return res.status(400).json({ error: 'File size must be 1..' + MAX_BYTES + ' bytes' });
    }

    // Folder ownership check
    const folder = await getOne(
      `SELECT id, owner_user_id, legal_hold, dek_wrapped, dek_iv, dek_tag
       FROM vault_folders WHERE id = $1`,
      [folderId]
    );
    if (!folder || String(folder.owner_user_id) !== String(user.id)) {
      return res.status(404).json({ error: 'Folder not found' });
    }
    if (folder.legal_hold) return res.status(409).json({ error: 'Folder is under legal hold' });

    // Optional entry ownership check
    if (entryId !== null) {
      const entry = await getOne('SELECT id, folder_id FROM vault_entries WHERE id = $1', [entryId]);
      if (!entry || String(entry.folder_id) !== String(folderId)) {
        return res.status(400).json({ error: 'Entry not found in this folder' });
      }
    }

    // Encrypt + persist
    const dek = unwrapFolderKey(folder);
    let filenameEnc, storedUrl;
    try {
      filenameEnc = encryptField(dek, filename);
      storedUrl = encryptField(dek, blobUrl);
    } finally {
      dek.fill(0);
    }

    const placeholderSha = fileChecksum(Buffer.alloc(0));

    const inserted = await getOne(
      `INSERT INTO vault_files
        (entry_id, folder_id, uploader_user_id, storage_key, mime_type,
         byte_size, checksum_sha256, filename_enc)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, created_at`,
      [
        entryId,
        folderId,
        user.id,
        storedUrl,
        mime,
        byteSize,
        placeholderSha,
        filenameEnc,
      ]
    );

    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'owner',
      action: audit.ACTIONS.FILE_UPLOAD,
      target_type: 'file',
      target_id: inserted && inserted.id,
      folder_id: folderId,
      metadata: { mime_type: mime, byte_size: byteSize, entry_id: entryId, source: 'client_commit' },
    });

    return res.status(200).json({
      success: true,
      file_id: inserted ? String(inserted.id) : null,
      created_at: inserted ? inserted.created_at : null,
    });
  } catch (err) {
    console.error('[vault/files/commit] failed:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
