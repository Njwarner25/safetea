/**
 * GET /api/vault/audit?folder_id=X[&limit=50]
 *
 * Owner-facing read of vault_audit_log — "who did what, when" on my folder.
 * Only folder-owner sees rows for their own folder_id. No cross-folder
 * reads. Break-glass events are surfaced here too so the owner is always
 * aware of any privileged access.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');
const { blockIfNotPlus } = require('../../services/vault/gating');

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 200;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  const folderId = parseInt(req.query.folder_id, 10);
  if (!Number.isInteger(folderId) || folderId <= 0) {
    return res.status(400).json({ error: 'folder_id required' });
  }

  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

  // Ownership check
  const folder = await getOne(
    `SELECT id, owner_user_id FROM vault_folders WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Folder not found' });
  }

  const rows = await getMany(
    `SELECT id, actor_role, action, target_type, target_id,
            metadata, created_at
     FROM vault_audit_log
     WHERE folder_id = $1
     ORDER BY created_at DESC
     LIMIT $2`,
    [folderId, limit]
  );

  // Never return ip_hash, user_agent, or actor_user_id to the owner —
  // those are for admin forensic use only. We return the action, target,
  // and any non-sensitive metadata.
  return res.status(200).json({
    events: rows.map(function (r) {
      return {
        id: String(r.id),
        actor_role: r.actor_role,
        action: r.action,
        target_type: r.target_type,
        target_id: r.target_id ? String(r.target_id) : null,
        metadata: r.metadata || {},
        created_at: r.created_at,
      };
    }),
  });
};
