/**
 * GET    /api/vault/contacts/:id     — fetch a single contact
 * PATCH  /api/vault/contacts/:id     — update phone/name/relationship
 * DELETE /api/vault/contacts/:id     — revoke (soft); pending requests are
 *                                      not auto-cancelled (owner reviews them)
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const ownerCrypto = require('../../../services/vault/owner-crypto');
const audit = require('../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  const contactId = parseInt(req.query.id, 10);
  if (!Number.isInteger(contactId) || contactId <= 0) {
    return res.status(400).json({ error: 'Invalid contact id' });
  }

  const row = await getOne(
    `SELECT id, owner_user_id, contact_email, contact_phone,
            contact_name_enc, relationship_enc, status,
            invite_token, created_at, activated_at, revoked_at
     FROM vault_trusted_contacts WHERE id = $1`,
    [contactId]
  );
  if (!row || row.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  try {
    if (req.method === 'GET') return handleGet(res, user, row);
    if (req.method === 'PATCH') return handlePatch(req, res, user, row);
    if (req.method === 'DELETE') return handleDelete(req, res, user, row);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/contacts/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

function shape(user, row) {
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
}

function handleGet(res, user, row) {
  return res.status(200).json({ contact: shape(user, row) });
}

async function handlePatch(req, res, user, row) {
  if (row.status === 'revoked') return res.status(410).json({ error: 'Contact revoked' });
  const body = (await parseBody(req)) || {};
  const hasName = typeof body.name === 'string';
  const hasPhone = Object.prototype.hasOwnProperty.call(body, 'phone');
  const hasRel = Object.prototype.hasOwnProperty.call(body, 'relationship');

  if (!hasName && !hasPhone && !hasRel) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  let nameEnc = null;
  if (hasName) {
    const name = body.name.trim();
    if (!name || name.length > 200) return res.status(400).json({ error: 'Name must be 1..200 chars' });
    nameEnc = ownerCrypto.encryptForOwner(user.id, name);
  }
  let relEnc = null;
  if (hasRel) {
    const rel = body.relationship == null ? '' : String(body.relationship).trim();
    relEnc = rel ? ownerCrypto.encryptForOwner(user.id, rel) : null;
  }
  const phone = hasPhone ? (body.phone ? String(body.phone).trim() : null) : null;

  await run(
    `UPDATE vault_trusted_contacts SET
       contact_name_enc = COALESCE($2, contact_name_enc),
       relationship_enc = CASE WHEN $3::boolean THEN $4 ELSE relationship_enc END,
       contact_phone    = CASE WHEN $5::boolean THEN $6 ELSE contact_phone END
     WHERE id = $1`,
    [row.id, nameEnc, hasRel, relEnc, hasPhone, phone]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: 'contact.update',
    target_type: 'contact',
    target_id: row.id,
  });

  return res.status(200).json({ ok: true });
}

async function handleDelete(req, res, user, row) {
  if (row.status === 'revoked') return res.status(410).json({ error: 'Already revoked' });

  await run(
    `UPDATE vault_trusted_contacts SET status = 'revoked', revoked_at = NOW() WHERE id = $1`,
    [row.id]
  );
  // Revoke any live contact sessions for this contact.
  await run(`DELETE FROM vault_contact_sessions WHERE contact_id = $1`, [row.id]);

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.CONTACT_REVOKE,
    target_type: 'contact',
    target_id: row.id,
  });

  return res.status(200).json({ ok: true });
}
