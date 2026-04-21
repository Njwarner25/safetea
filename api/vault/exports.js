/**
 * GET  /api/vault/exports[?folder_id=X]
 *   List the caller's exports (optional folder filter).
 *
 * POST /api/vault/exports
 *   Body: { folder_id, expires_hours? }
 *   Owner-initiated export. Returns { export_id, share_url, expires_at }.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getMany } = require('../_utils/db');
const { generateFolderExport, DEFAULT_EXPIRY_HOURS, MAX_EXPIRY_HOURS } = require('../../services/vault/export');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  try {
    if (req.method === 'GET') return handleList(req, res, user);
    if (req.method === 'POST') return handleCreate(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/exports] fatal:', err);
    return res.status(500).json({ error: 'Server error', details: err && err.message });
  }
};

async function handleList(req, res, user) {
  const folderId = req.query.folder_id ? parseInt(req.query.folder_id, 10) : null;
  const params = [user.id];
  let extra = '';
  if (Number.isInteger(folderId) && folderId > 0) {
    params.push(folderId);
    extra = ` AND folder_id = $${params.length}`;
  }

  const rows = await getMany(
    `SELECT id, folder_id, triggered_by, access_request_id, format,
            share_token, expires_at, storage_deleted_at, downloaded_at,
            download_count, created_at
     FROM vault_exports
     WHERE owner_user_id = $1 ${extra}
     ORDER BY created_at DESC
     LIMIT 100`,
    params
  );

  const appUrl = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '');
  return res.status(200).json({
    exports: rows.map(function (r) {
      const active = !r.storage_deleted_at && new Date(r.expires_at).getTime() > Date.now();
      return {
        id: String(r.id),
        folder_id: String(r.folder_id),
        triggered_by: r.triggered_by,
        access_request_id: r.access_request_id ? String(r.access_request_id) : null,
        format: r.format,
        share_url: active ? `${appUrl}/api/share/${encodeURIComponent(r.share_token)}` : null,
        expires_at: r.expires_at,
        revoked_at: r.storage_deleted_at,
        downloaded_at: r.downloaded_at,
        download_count: r.download_count || 0,
        created_at: r.created_at,
      };
    }),
  });
}

async function handleCreate(req, res, user) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({ error: 'Blob storage not configured' });
  }
  const body = (await parseBody(req)) || {};
  const folderId = parseInt(body.folder_id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'folder_id required' });
  }
  const hoursRaw = Number.isInteger(body.expires_hours) ? body.expires_hours : DEFAULT_EXPIRY_HOURS;
  const hours = Math.max(1, Math.min(MAX_EXPIRY_HOURS, hoursRaw));

  try {
    const result = await generateFolderExport({
      folderId: folderId,
      ownerUserId: user.id,
      triggeredBy: 'owner',
      accessRequestId: null,
      expiresHours: hours,
      req: req,
    });
    return res.status(201).json({
      export_id: result.exportId,
      share_url: result.shareUrl,
      expires_at: result.expiresAt,
    });
  } catch (err) {
    return res.status(400).json({ error: err && err.message ? err.message : 'Export failed' });
  }
}
