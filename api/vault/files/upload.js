/**
 * POST /api/vault/files/upload
 *
 * Two-phase protocol driven by @vercel/blob/client's handleUpload.
 *
 *   1. Client → this endpoint: { type: 'blob.generate-client-token', ... }
 *      handleUpload calls onBeforeGenerateToken, we validate auth + folder
 *      ownership + MIME + size, return allowedContentTypes + tokenPayload,
 *      and handleUpload returns a signed client token.
 *
 *   2. Client → Vercel Blob storage (direct PUT with the token).
 *
 *   3. Vercel Blob CDN → this endpoint: { type: 'blob.upload-completed', ... }
 *      with an x-vercel-signature header. handleUpload verifies the
 *      signature then calls onUploadCompleted, where we insert vault_files.
 *
 * IMPORTANT: we do NOT pre-auth-gate this endpoint. The onUploadCompleted
 * callback has no user JWT (Blob CDN doesn't have our session tokens), so
 * a pre-gate would 401 it. Instead, auth + tier + ownership all move
 * INSIDE onBeforeGenerateToken (the only leg that's owner-initiated). The
 * callback leg is authenticated by the signed token + signature header
 * that handleUpload verifies automatically.
 *
 * This follows Vercel's own handleUpload example pattern.
 */

'use strict';

const { authenticate, cors } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { encryptField, unwrapFolderKey, fileChecksum } = require('../../../services/vault/encryption');
const storage = require('../../../services/vault/storage');
const audit = require('../../../services/vault/audit');
const { isPlusUser } = require('../../../services/vault/gating');

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
  'video/mp4',
  'video/webm',
  'video/quicktime',
  'video/x-m4v',
]);

const MAX_BYTES = 25 * 1024 * 1024; // 25 MB per file (V1)

/**
 * Vercel plain functions hand us req.body as a Buffer, a string, a
 * pre-parsed object, or nothing (raw stream). Normalize to a parsed
 * object so handleUpload sees a consistent shape.
 */
async function readBodyAsObject(req) {
  if (!req) return {};
  if (req.body != null) {
    if (Buffer.isBuffer(req.body)) {
      try { return JSON.parse(req.body.toString('utf8')); } catch (_) { return {}; }
    }
    if (typeof req.body === 'string' && req.body.length) {
      try { return JSON.parse(req.body); } catch (_) { return {}; }
    }
    if (typeof req.body === 'object') return req.body;
  }
  // Stream fallback
  const raw = await new Promise(function (resolve) {
    let data = '';
    let done = false;
    const finish = function () { if (done) return; done = true; resolve(data); };
    try {
      req.on('data', function (chunk) { data += chunk; });
      req.on('end', finish);
      req.on('error', finish);
    } catch (_) { return finish(); }
    setTimeout(finish, 5000);
  });
  if (!raw || !raw.length) return {};
  try { return JSON.parse(raw); } catch (_) { return {}; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'File uploads are not yet configured. Attach a Vercel Blob store.' });
  }

  // Attempt to authenticate — may return null for the callback leg
  // (Vercel Blob CDN doesn't send our session token). That's fine;
  // callback authenticity is proved by the x-vercel-signature header
  // that handleUpload verifies, not by our JWT.
  const user = await authenticate(req);

  // Normalize body shape once so handleUpload + our logging see the same thing.
  const body = await readBodyAsObject(req);
  const bodyType = body && typeof body === 'object' ? body.type : null;

  console.log('[vault/upload]',
    'content_type=', (req.headers && req.headers['content-type']) || '(none)',
    'has_auth=', !!(req.headers && req.headers.authorization),
    'has_signature=', !!(req.headers && (req.headers['x-vercel-signature'] || req.headers['x-vercel-blob-signature'])),
    'body_type=', bodyType || '(missing)',
    'body_keys=', body && typeof body === 'object' ? Object.keys(body).join(',') : '(none)',
    'user_id=', user ? user.id : '(null)'
  );

  try {
    const jsonResponse = await storage.handleClientUpload(req, res, {
      body: body,

      // Fires ONLY on the token-gen leg (owner-initiated upload).
      onBeforeGenerateToken: async function (pathname, clientPayload) {
        // ---- ALL auth + validation lives here ----
        if (!user) {
          throw new Error('Unauthorized: sign in to upload');
        }
        if (!isPlusUser(user)) {
          const err = new Error('SafeTea+ subscription required');
          err.upgrade = true;
          throw err;
        }

        let payload = {};
        try {
          payload = typeof clientPayload === 'string'
            ? JSON.parse(clientPayload)
            : (clientPayload || {});
        } catch (_) {}

        const folderId = parseInt(payload.folder_id, 10);
        const entryId = payload.entry_id != null ? parseInt(payload.entry_id, 10) : null;
        const filename = typeof payload.filename === 'string' ? payload.filename : 'attachment';
        const mime = typeof payload.mime_type === 'string' ? payload.mime_type.toLowerCase() : '';
        const byteSize = Number(payload.byte_size);

        if (!Number.isInteger(folderId) || folderId <= 0) throw new Error('folder_id required');
        if (!ALLOWED_MIME.has(mime)) throw new Error('Content-Type ' + mime + ' not allowed');
        if (!Number.isFinite(byteSize) || byteSize <= 0 || byteSize > MAX_BYTES) {
          throw new Error('File size must be 1..' + MAX_BYTES + ' bytes');
        }

        // Folder ownership check
        const folder = await getOne(
          'SELECT id, owner_user_id, legal_hold FROM vault_folders WHERE id = $1',
          [folderId]
        );
        if (!folder || String(folder.owner_user_id) !== String(user.id)) {
          throw new Error('Folder not found');
        }
        if (folder.legal_hold) throw new Error('Folder is under legal hold');

        // Optional entry ownership check (pg returns bigint as string;
        // folderId here is a JS number — coerce to String on both sides).
        if (entryId !== null) {
          const entry = await getOne(
            'SELECT id, folder_id FROM vault_entries WHERE id = $1',
            [entryId]
          );
          if (!entry || String(entry.folder_id) !== String(folderId)) {
            throw new Error('Entry not found in this folder');
          }
        }

        return {
          allowedContentTypes: [mime],
          maximumSizeInBytes: MAX_BYTES,
          tokenPayload: JSON.stringify({
            folder_id: folderId,
            entry_id: entryId,
            filename: filename,
            mime_type: mime,
            byte_size: byteSize,
            uploader_user_id: String(user.id),
          }),
        };
      },

      // Fires ONLY on the completion leg. Signature is verified by
      // handleUpload before we get here — the meta in tokenPayload is
      // trusted because we signed it above.
      onUploadCompleted: async function (event) {
        const uploadedBlob = event && event.blob ? event.blob : event;
        const rawTokenPayload = event && event.tokenPayload != null ? event.tokenPayload : null;

        let meta = {};
        try {
          meta = typeof rawTokenPayload === 'string'
            ? JSON.parse(rawTokenPayload)
            : (rawTokenPayload || {});
        } catch (_) {}

        const folder = await getOne(
          'SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag FROM vault_folders WHERE id = $1',
          [meta.folder_id]
        );
        if (!folder || String(folder.owner_user_id) !== String(meta.uploader_user_id)) {
          // Race: folder deleted / ownership changed between token-gen
          // and completion. Purge the orphan blob + no-op on audit.
          try { await storage.removeBlob(uploadedBlob && uploadedBlob.url); } catch (_) {}
          return;
        }

        const dek = unwrapFolderKey(folder);
        let filenameEnc, storedUrl;
        try {
          filenameEnc = encryptField(dek, meta.filename || 'attachment');
          storedUrl = encryptField(dek, uploadedBlob.url);
        } finally {
          dek.fill(0);
        }

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
    const status = err && /unauthorized/i.test(err.message) ? 401
      : err && err.upgrade ? 403
      : 400;
    return res.status(status).json({
      error: err && err.message ? err.message : 'Upload failed',
      upgrade: err && err.upgrade ? true : undefined,
    });
  }
};
