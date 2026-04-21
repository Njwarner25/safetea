/**
 * POST /api/vault/files/upload
 *
 * Two-phase protocol driven by @vercel/blob/client. The client sends
 * a request with the planned pathname + a clientPayload carrying
 * { folder_id, entry_id, filename, mime_type, byte_size }. This handler:
 *
 *   1. Verifies the caller owns the folder.
 *   2. Validates MIME + size.
 *   3. Returns a short-lived Blob upload token scoped to that pathname.
 *   4. Client uploads directly to Blob (bypassing our 4.5 MB function body
 *      limit).
 *   5. Blob POSTs back to this same endpoint with `onUploadCompleted`
 *      body, at which point we insert vault_files and write an audit row.
 *
 * Ownership: folder membership gates everything. Cross-folder attack
 * (trying to upload into another user's folder) fails at step 1.
 */

'use strict';

const { authenticate, cors } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { encryptField, unwrapFolderKey, fileChecksum } = require('../../../services/vault/encryption');
const storage = require('../../../services/vault/storage');
const audit = require('../../../services/vault/audit');

const ALLOWED_MIME = new Set([
  'image/jpeg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/webp',
  'application/pdf',
  'audio/m4a',
  'audio/mpeg',
  'audio/mp3',
  'audio/wav',
  'audio/webm',
  'audio/aac',
  'audio/ogg',
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file (V1)

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Authentication: the token-issue leg MUST come from a signed-in user.
  // The onUploadCompleted leg is an internal callback from Vercel Blob —
  // we trust it by virtue of the handshake tokenPayload we signed in
  // onBeforeGenerateToken.
  const user = await authenticate(req);
  const isCompletion = !!(req.body && req.body.type === 'blob.upload-completed');
  if (!user && !isCompletion) return res.status(401).json({ error: 'Unauthorized' });

  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'File uploads are not yet configured. Attach a Vercel Blob store.' });
  }

  try {
    const jsonResponse = await storage.handleClientUpload(req, res, {
      onBeforeGenerateToken: async function (pathname, clientPayload) {
        // clientPayload is a JSON string from the browser; parse defensively.
        let payload = {};
        try { payload = typeof clientPayload === 'string' ? JSON.parse(clientPayload) : (clientPayload || {}); } catch (_) {}

        const folderId = parseInt(payload.folder_id, 10);
        const entryId = payload.entry_id != null ? parseInt(payload.entry_id, 10) : null;
        const filename = typeof payload.filename === 'string' ? payload.filename : 'attachment';
        const mime = typeof payload.mime_type === 'string' ? payload.mime_type.toLowerCase() : '';
        const byteSize = Number(payload.byte_size);

        if (!Number.isInteger(folderId) || folderId <= 0) throw new Error('folder_id required');
        if (!ALLOWED_MIME.has(mime)) throw new Error(`Content-Type ${mime} not allowed`);
        if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) {
          throw new Error(`File size must be 1..${MAX_BYTES} bytes`);
        }

        // Ownership check — fails here, token is not issued
        const folder = await getOne(
          'SELECT id, owner_user_id, legal_hold FROM vault_folders WHERE id = $1',
          [folderId]
        );
        if (!folder || folder.owner_user_id !== user.id) throw new Error('Folder not found');
        if (folder.legal_hold) throw new Error('Folder is under legal hold');

        // Optional entry check (the file can be attached to an existing
        // entry or orphaned until slice 5 wires a join).
        if (entryId !== null) {
          const entry = await getOne(
            'SELECT id, folder_id FROM vault_entries WHERE id = $1',
            [entryId]
          );
          if (!entry || entry.folder_id !== folderId) throw new Error('Entry not found in this folder');
        }

        return {
          allowedContentTypes: [mime],
          maximumSizeInBytes: MAX_BYTES,
          // Signed by Vercel; returned to us verbatim in onUploadCompleted.
          tokenPayload: JSON.stringify({
            folder_id: folderId,
            entry_id: entryId,
            filename,
            mime_type: mime,
            byte_size: byteSize,
            uploader_user_id: user.id,
          }),
        };
      },

      onUploadCompleted: async function (uploadedBlob, tokenPayload) {
        // Runs AFTER the client's PUT to Blob finishes. We cannot call
        // authenticate(req) here — the req is coming from Vercel Blob's
        // callback, not the original user. We trust the tokenPayload
        // because we signed it above.
        let meta = {};
        try { meta = typeof tokenPayload === 'string' ? JSON.parse(tokenPayload) : (tokenPayload || {}); } catch (_) {}

        const folder = await getOne(
          'SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag FROM vault_folders WHERE id = $1',
          [meta.folder_id]
        );
        if (!folder || folder.owner_user_id !== meta.uploader_user_id) {
          // Race: folder was deleted / ownership changed between token
          // issuance and upload completion. Purge the orphan blob.
          try { await storage.removeBlob(uploadedBlob.url); } catch (_) {}
          return;
        }

        const dek = unwrapFolderKey(folder);
        let filenameEnc, storedUrl;
        try {
          filenameEnc = encryptField(dek, meta.filename || 'attachment');
          // Encrypt the URL too so a DB-only leak doesn't hand out files.
          storedUrl = encryptField(dek, uploadedBlob.url);
        } finally {
          dek.fill(0);
        }

        // Placeholder checksum — @vercel/blob does not return one yet; client
        // can PATCH it later if we add a commit endpoint. For V1 we store a
        // zero-length SHA so the NOT NULL constraint holds; V2 adds integrity
        // verification via a commit POST.
        const placeholderSha = fileChecksum(Buffer.alloc(0));

        await run(
          `INSERT INTO vault_files
            (entry_id, folder_id, uploader_user_id, storage_key, mime_type,
             byte_size, checksum_sha256, filename_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            meta.entry_id || null,
            meta.folder_id,
            meta.uploader_user_id,
            storedUrl,
            meta.mime_type,
            meta.byte_size,
            placeholderSha,
            filenameEnc,
          ]
        );

        audit.write({
          actor_user_id: meta.uploader_user_id,
          actor_role: 'owner',
          action: audit.ACTIONS.FILE_UPLOAD,
          target_type: 'file',
          folder_id: meta.folder_id,
          metadata: { mime_type: meta.mime_type, byte_size: meta.byte_size, entry_id: meta.entry_id },
        });
      },
    });

    return res.status(200).json(jsonResponse);
  } catch (err) {
    console.error('[vault/files/upload] failed:', err && err.message);
    return res.status(400).json({ error: err && err.message ? err.message : 'Upload failed' });
  }
};
