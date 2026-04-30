/**
 * GET /api/vault/access-requests[?status=pending]
 *   List access requests the caller needs to respond to (or historical).
 *
 * Defaults to status=pending — the most common case (owner sees their inbox).
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');
const ownerCrypto = require('../../services/vault/owner-crypto');
const { unwrapFolderKey, decryptField } = require('../../services/vault/encryption');
const { blockIfNotPlus } = require('../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  res.setHeader('Pragma', 'no-cache');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  const statusFilter = typeof req.query.status === 'string' ? req.query.status : 'pending';
  const allowed = ['pending', 'approved', 'denied', 'expired', 'released', 'all'];
  if (allowed.indexOf(statusFilter) === -1) {
    return res.status(400).json({ error: `status must be one of: ${allowed.join(', ')}` });
  }

  const whereStatus = statusFilter === 'all' ? '' : `AND ar.status = '${statusFilter}'`;

  const rows = await getMany(
    `SELECT ar.id, ar.contact_id, ar.folder_id, ar.reason, ar.status,
            ar.countdown_ends_at, ar.resolved_at, ar.created_at,
            tc.contact_email, tc.contact_name_enc,
            f.title_enc,
            f.dek_wrapped, f.dek_iv, f.dek_tag
     FROM vault_access_requests ar
     JOIN vault_trusted_contacts tc ON tc.id = ar.contact_id
     JOIN vault_folders f ON f.id = ar.folder_id
     WHERE ar.owner_user_id = $1 ${whereStatus}
     ORDER BY ar.status = 'pending' DESC, ar.created_at DESC
     LIMIT 100`,
    [user.id]
  );

  // Decrypt folder titles per-request (one DEK unwrap per row). Not hot path
  // — expecting <50 active requests per owner in realistic V1 usage.
  const requests = rows.map(function (row) {
    const dek = unwrapFolderKey(row);
    let folderTitle;
    try {
      folderTitle = row.title_enc ? decryptField(dek, row.title_enc) : null;
    } finally {
      dek.fill(0);
    }
    return {
      id: String(row.id),
      contact_id: String(row.contact_id),
      folder_id: String(row.folder_id),
      folder_title: folderTitle,
      contact_email: row.contact_email,
      contact_name: ownerCrypto.decryptForOwner(user.id, row.contact_name_enc),
      reason: row.reason,
      status: row.status,
      countdown_ends_at: row.countdown_ends_at,
      resolved_at: row.resolved_at,
      created_at: row.created_at,
    };
  });

  return res.status(200).json({ requests });
};
