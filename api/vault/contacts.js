/**
 * GET  /api/vault/contacts    — list the caller's trusted contacts
 * POST /api/vault/contacts    — create a contact, send invite email
 *                               Body: { email, name, phone?, relationship?, folder_ids?, countdown_hours? }
 *
 * Contacts never become SafeTea account holders. Name + relationship are
 * encrypted at rest under an owner-scoped key (services/vault/owner-crypto).
 */

'use strict';

const crypto = require('crypto');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const ownerCrypto = require('../../services/vault/owner-crypto');
const notifications = require('../../services/vault/notifications');
const audit = require('../../services/vault/audit');
const { blockIfNotPlus } = require('../../services/vault/gating');

const MAX_CONTACTS_PER_OWNER = 10;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  try {
    if (req.method === 'GET') return handleList(req, res, user);
    if (req.method === 'POST') return handleCreate(req, res, user);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/contacts] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function handleList(req, res, user) {
  const rows = await getMany(
    `SELECT id, contact_email, contact_phone, contact_name_enc, relationship_enc,
            status, invite_token, created_at, activated_at, revoked_at
     FROM vault_trusted_contacts
     WHERE owner_user_id = $1
     ORDER BY status ASC, created_at DESC`,
    [user.id]
  );

  const contacts = rows.map(function (row) {
    return {
      id: String(row.id),
      email: row.contact_email,
      phone: row.contact_phone,
      name: ownerCrypto.decryptForOwner(user.id, row.contact_name_enc),
      relationship: ownerCrypto.decryptForOwner(user.id, row.relationship_enc),
      status: row.status,
      invite_token: row.status === 'pending' ? row.invite_token : null,
      created_at: row.created_at,
      activated_at: row.activated_at,
      revoked_at: row.revoked_at,
    };
  });

  return res.status(200).json({ contacts });
}

async function handleCreate(req, res, user) {
  const body = (await parseBody(req)) || {};
  const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const phone = typeof body.phone === 'string' ? body.phone.trim() : null;
  const relationship = typeof body.relationship === 'string' ? body.relationship.trim() : null;
  const folderIds = Array.isArray(body.folder_ids) ? body.folder_ids : [];
  const countdownHours = Number.isInteger(body.countdown_hours) ? body.countdown_hours : 48;

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ error: 'Valid email required' });
  }
  if (!name || name.length > 200) return res.status(400).json({ error: 'Name required (1..200 chars)' });

  // De-dup + cap
  const existing = await getOne(
    `SELECT id FROM vault_trusted_contacts WHERE owner_user_id = $1 AND contact_email = $2`,
    [user.id, email]
  );
  if (existing) {
    return res.status(409).json({ error: 'You already have a trusted contact with that email' });
  }
  const countRow = await getOne(
    `SELECT COUNT(*)::int AS c FROM vault_trusted_contacts WHERE owner_user_id = $1 AND status <> 'revoked'`,
    [user.id]
  );
  if (countRow && countRow.c >= MAX_CONTACTS_PER_OWNER) {
    return res.status(409).json({ error: `Maximum of ${MAX_CONTACTS_PER_OWNER} active trusted contacts` });
  }

  // Validate optional folder_ids belong to the caller
  if (folderIds.length > 0) {
    const ok = await getMany(
      `SELECT id FROM vault_folders WHERE owner_user_id = $1 AND id = ANY($2::bigint[])`,
      [user.id, folderIds]
    );
    if (ok.length !== folderIds.length) {
      return res.status(400).json({ error: 'One or more folder_ids are invalid' });
    }
  }

  const inviteToken = crypto.randomBytes(36).toString('base64url').slice(0, 48);

  const inserted = await getOne(
    `INSERT INTO vault_trusted_contacts
      (owner_user_id, contact_email, contact_phone, contact_name_enc,
       relationship_enc, invite_token, status)
     VALUES ($1, $2, $3, $4, $5, $6, 'pending')
     RETURNING id, created_at`,
    [
      user.id,
      email,
      phone,
      ownerCrypto.encryptForOwner(user.id, name),
      relationship ? ownerCrypto.encryptForOwner(user.id, relationship) : null,
      inviteToken,
    ]
  );

  // Seed folder-specific permissions (if any).
  for (let i = 0; i < folderIds.length; i++) {
    await run(
      `INSERT INTO vault_contact_permissions
        (contact_id, folder_id, can_request, auto_release_on_timeout, countdown_hours)
       VALUES ($1, $2, true, false, $3)
       ON CONFLICT (contact_id, folder_id) DO NOTHING`,
      [inserted.id, folderIds[i], Math.max(1, Math.min(168, countdownHours))]
    );
  }

  // Fire-and-forget — a failed send doesn't rollback the 201.
  notifications
    .sendContactInvite(email, user.display_name || user.email, inviteToken)
    .catch(function () {});

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.CONTACT_INVITE,
    target_type: 'contact',
    target_id: inserted.id,
    metadata: { folder_count: folderIds.length },
  });

  return res.status(201).json({
    contact: {
      id: String(inserted.id),
      email: email,
      name: name,
      phone: phone,
      relationship: relationship,
      status: 'pending',
      invite_token: inviteToken,
      created_at: inserted.created_at,
    },
  });
}
