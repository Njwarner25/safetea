/**
 * POST /api/vault/access-requests/:id/approve
 *   Body: { message? }
 *   Approve the request. V1 stub: marks approved; actual export generation
 *   + share link emission lives in slice 9. For now we notify the contact
 *   that access was approved — the share URL will be a placeholder until
 *   slice 9 replaces it.
 *
 * POST /api/vault/access-requests/:id/deny
 *   Body: { message? }
 *   Deny the request; notify the contact neutrally.
 *
 * Routing: this file handles both verbs via a trailing action in the path,
 * captured as req.query.action (see vercel.json rewrites).
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { unwrapFolderKey, decryptField } = require('../../../services/vault/encryption');
const ownerCrypto = require('../../../services/vault/owner-crypto');
const notifications = require('../../../services/vault/notifications');
const audit = require('../../../services/vault/audit');
const { generateFolderExport } = require('../../../services/vault/export');
const { blockIfNotPlus } = require('../../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  const requestId = parseInt(req.query.id, 10);
  const action = String(req.query.action || '').toLowerCase();
  if (!Number.isInteger(requestId) || requestId <= 0) return res.status(400).json({ error: 'Invalid request id' });
  if (action !== 'approve' && action !== 'deny') return res.status(400).json({ error: 'action must be approve or deny' });

  try {
    const row = await getOne(
      `SELECT ar.id, ar.owner_user_id, ar.contact_id, ar.folder_id, ar.status,
              tc.contact_email, tc.contact_name_enc,
              f.title_enc, f.dek_wrapped, f.dek_iv, f.dek_tag
       FROM vault_access_requests ar
       JOIN vault_trusted_contacts tc ON tc.id = ar.contact_id
       JOIN vault_folders f ON f.id = ar.folder_id
       WHERE ar.id = $1`,
      [requestId]
    );
    if (!row || row.owner_user_id !== user.id) {
      return res.status(404).json({ error: 'Request not found' });
    }
    if (row.status !== 'pending') {
      return res.status(409).json({ error: `Request is already ${row.status}` });
    }

    const dek = unwrapFolderKey(row);
    let folderTitle;
    try {
      folderTitle = row.title_enc ? decryptField(dek, row.title_enc) : 'a folder';
    } finally {
      dek.fill(0);
    }
    const contactName = ownerCrypto.decryptForOwner(user.id, row.contact_name_enc);

    if (action === 'approve') {
      await run(
        `UPDATE vault_access_requests SET status = 'approved', resolved_at = NOW() WHERE id = $1`,
        [row.id]
      );

      // Slice 9: generate a real export + signed share URL.
      let shareUrl;
      let exportId = null;
      try {
        const result = await generateFolderExport({
          folderId: row.folder_id,
          ownerUserId: user.id,
          triggeredBy: 'access_request',
          accessRequestId: row.id,
          expiresHours: 72,
          req: req,
        });
        shareUrl = result.shareUrl;
        exportId = result.exportId;
        // Link the export back to the access_request row
        await run(
          `UPDATE vault_access_requests SET release_export_id = $1 WHERE id = $2`,
          [exportId, row.id]
        );
      } catch (expErr) {
        console.error('[vault/access-requests] export generation failed:', expErr && expErr.message);
        // Fall back to a stub so the approval itself isn't lost. Owner
        // can retry the export via /api/vault/exports.
        shareUrl = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '') +
          '/vault-request?share=' + encodeURIComponent(row.id) + '&status=export-failed';
      }

      notifications.sendAccessApproved(row.contact_email, contactName, folderTitle, shareUrl)
        .catch(function () {});

      audit.write({
        req,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: audit.ACTIONS.ACCESS_APPROVE,
        target_type: 'access_request',
        target_id: row.id,
        folder_id: row.folder_id,
        metadata: { contact_id: row.contact_id, export_id: exportId },
      });

      return res.status(200).json({ ok: true, status: 'approved', export_id: exportId });
    }

    // action === 'deny'
    await run(
      `UPDATE vault_access_requests SET status = 'denied', resolved_at = NOW() WHERE id = $1`,
      [row.id]
    );
    notifications.sendAccessDenied(row.contact_email, contactName).catch(function () {});

    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'owner',
      action: audit.ACTIONS.ACCESS_DENY,
      target_type: 'access_request',
      target_id: row.id,
      folder_id: row.folder_id,
      metadata: { contact_id: row.contact_id },
    });

    return res.status(200).json({ ok: true, status: 'denied' });
  } catch (err) {
    console.error('[vault/access-requests/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
