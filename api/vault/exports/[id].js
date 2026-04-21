/**
 * GET    /api/vault/exports/:id     — owner detail (metadata only; no bytes)
 * DELETE /api/vault/exports/:id     — revoke early: delete blob, null
 *                                      storage_key, keep row for audit
 */

'use strict';

const { authenticate, cors } = require('../../_utils/auth');
const { getOne } = require('../../_utils/db');
const { revokeExport } = require('../../../services/vault/export');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  const exportId = parseInt(req.query.id, 10);
  if (!Number.isInteger(exportId) || exportId <= 0) {
    return res.status(400).json({ error: 'Invalid export id' });
  }

  const row = await getOne(
    `SELECT id, owner_user_id, folder_id, triggered_by, access_request_id,
            format, share_token, expires_at, storage_deleted_at,
            downloaded_at, download_count, created_at
     FROM vault_exports WHERE id = $1`,
    [exportId]
  );
  if (!row || row.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Export not found' });
  }

  try {
    if (req.method === 'GET') {
      const appUrl = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '');
      const active = !row.storage_deleted_at && new Date(row.expires_at).getTime() > Date.now();
      return res.status(200).json({
        export: {
          id: String(row.id),
          folder_id: String(row.folder_id),
          triggered_by: row.triggered_by,
          access_request_id: row.access_request_id ? String(row.access_request_id) : null,
          format: row.format,
          share_url: active ? `${appUrl}/api/share/${encodeURIComponent(row.share_token)}` : null,
          expires_at: row.expires_at,
          revoked_at: row.storage_deleted_at,
          downloaded_at: row.downloaded_at,
          download_count: row.download_count || 0,
          created_at: row.created_at,
        },
      });
    }

    if (req.method === 'DELETE') {
      const result = await revokeExport(row.id, user.id, req);
      if (!result.ok) return res.status(400).json({ error: result.error || 'Revoke failed' });
      return res.status(200).json({ ok: true, already_revoked: !!result.already });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/exports/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error', details: err && err.message });
  }
};
