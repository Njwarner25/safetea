/**
 * GET  /api/vault/contact-portal/request?session_token=...
 *   List folders this contact is pre-authorized to request access to.
 *
 * POST /api/vault/contact-portal/request
 *   Body: { session_token, folder_id, reason }
 *   Create an access_request. Countdown starts immediately. Owner is emailed.
 */

'use strict';

const { cors, parseBody } = require('../../_utils/auth');
const { getOne, getMany, run } = require('../../_utils/db');
const { unwrapFolderKey, decryptField } = require('../../../services/vault/encryption');
const ownerCrypto = require('../../../services/vault/owner-crypto');
const notifications = require('../../../services/vault/notifications');
const audit = require('../../../services/vault/audit');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  try {
    if (req.method === 'GET') return handleListFolders(req, res);
    if (req.method === 'POST') return handleSubmit(req, res);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/contact-portal/request] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function resolveContact(sessionToken) {
  if (!sessionToken || typeof sessionToken !== 'string') return null;
  const row = await getOne(
    `SELECT s.contact_id, s.expires_at,
            c.owner_user_id, c.status, c.contact_email, c.contact_name_enc
     FROM vault_contact_sessions s
     JOIN vault_trusted_contacts c ON c.id = s.contact_id
     WHERE s.token = $1`,
    [sessionToken]
  );
  if (!row) return null;
  if (new Date(row.expires_at).getTime() < Date.now()) return null;
  if (row.status === 'revoked') return null;
  return row;
}

async function handleListFolders(req, res) {
  const contact = await resolveContact(req.query.session_token);
  if (!contact) return res.status(401).json({ error: 'Session expired. Request a new code.' });

  // List folders for which this contact has can_request = true.
  const rows = await getMany(
    `SELECT p.folder_id, p.countdown_hours,
            f.title_enc, f.dek_wrapped, f.dek_iv, f.dek_tag, f.legal_hold
     FROM vault_contact_permissions p
     JOIN vault_folders f ON f.id = p.folder_id
     WHERE p.contact_id = $1 AND p.can_request = true AND f.archived = false`,
    [contact.contact_id]
  );

  const folders = rows.map(function (row) {
    const dek = unwrapFolderKey(row);
    let title;
    try { title = row.title_enc ? decryptField(dek, row.title_enc) : 'Untitled'; }
    finally { dek.fill(0); }
    return {
      folder_id: String(row.folder_id),
      title: title,
      countdown_hours: row.countdown_hours,
      legal_hold: !!row.legal_hold,
    };
  });

  return res.status(200).json({ folders });
}

async function handleSubmit(req, res) {
  const body = (await parseBody(req)) || {};
  const contact = await resolveContact(body.session_token);
  if (!contact) return res.status(401).json({ error: 'Session expired. Request a new code.' });

  const folderId = parseInt(body.folder_id, 10);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'folder_id required' });
  if (!reason) return res.status(400).json({ error: 'Reason required' });
  if (reason.length > 2000) return res.status(400).json({ error: 'Reason too long (max 2000 chars)' });

  const perm = await getOne(
    `SELECT p.folder_id, p.countdown_hours, p.can_request,
            f.owner_user_id, f.legal_hold, f.title_enc,
            f.dek_wrapped, f.dek_iv, f.dek_tag
     FROM vault_contact_permissions p
     JOIN vault_folders f ON f.id = p.folder_id
     WHERE p.contact_id = $1 AND p.folder_id = $2`,
    [contact.contact_id, folderId]
  );
  if (!perm || !perm.can_request) {
    return res.status(403).json({ error: 'You are not authorized to request this folder' });
  }

  // Block duplicate pending requests from the same contact for the same folder.
  const existing = await getOne(
    `SELECT id FROM vault_access_requests
     WHERE contact_id = $1 AND folder_id = $2 AND status = 'pending'`,
    [contact.contact_id, folderId]
  );
  if (existing) return res.status(409).json({ error: 'You already have a pending request for this folder' });

  const hours = perm.countdown_hours || 48;
  const countdownEnd = new Date(Date.now() + hours * 3600 * 1000);

  const created = await getOne(
    `INSERT INTO vault_access_requests
      (contact_id, owner_user_id, folder_id, reason, status,
       otp_verified_at, countdown_ends_at)
     VALUES ($1, $2, $3, $4, 'pending', NOW(), $5)
     RETURNING id, created_at`,
    [contact.contact_id, perm.owner_user_id, folderId, reason, countdownEnd]
  );

  // Decrypt folder title for the owner's notification email.
  const dek = unwrapFolderKey(perm);
  let folderTitle;
  try { folderTitle = perm.title_enc ? decryptField(dek, perm.title_enc) : 'a folder'; }
  finally { dek.fill(0); }

  // Look up the owner's email for the notification.
  const owner = await getOne(
    `SELECT email, display_name FROM users WHERE id = $1`,
    [perm.owner_user_id]
  );
  if (owner && owner.email) {
    const contactName = ownerCrypto.decryptForOwner(perm.owner_user_id, contact.contact_name_enc);
    notifications.sendAccessRequestNotice(
      owner.email,
      owner.display_name,
      contactName,
      folderTitle,
      reason,
      countdownEnd
    ).catch(function () {});
  }

  audit.write({
    req,
    actor_user_id: null, // contact is not a SafeTea user
    actor_role: 'contact',
    action: audit.ACTIONS.ACCESS_REQUEST,
    target_type: 'access_request',
    target_id: created.id,
    folder_id: folderId,
    metadata: {
      contact_id: contact.contact_id,
      countdown_hours: hours,
    },
  });

  return res.status(201).json({
    ok: true,
    request_id: String(created.id),
    countdown_ends_at: countdownEnd.toISOString(),
  });
}
