/**
 * GET /api/vault/contacts/:id/permissions
 *   List which folders this contact can request + their per-folder settings.
 *
 * PUT /api/vault/contacts/:id/permissions
 *   Body: { permissions: [{ folder_id, can_request, auto_release_on_timeout,
 *                           countdown_hours }] }
 *   Full replacement — any folder_id not in the array is removed from the
 *   contact's permissions.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../../_utils/auth');
const { getOne, getMany, run } = require('../../../_utils/db');
const audit = require('../../../../services/vault/audit');
const { blockIfNotPlus } = require('../../../../services/vault/gating');

const MIN_HOURS = 1;
const MAX_HOURS = 168;

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

  const contact = await getOne(
    `SELECT id, owner_user_id, status FROM vault_trusted_contacts WHERE id = $1`,
    [contactId]
  );
  if (!contact || contact.owner_user_id !== user.id) {
    return res.status(404).json({ error: 'Contact not found' });
  }

  try {
    if (req.method === 'GET') return handleGet(res, user, contact);
    if (req.method === 'PUT') return handlePut(req, res, user, contact);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/contacts/permissions] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

async function handleGet(res, user, contact) {
  const rows = await getMany(
    `SELECT p.folder_id, p.can_request, p.auto_release_on_timeout,
            p.countdown_hours, p.updated_at
     FROM vault_contact_permissions p
     JOIN vault_folders f ON f.id = p.folder_id
     WHERE p.contact_id = $1 AND f.owner_user_id = $2
     ORDER BY p.updated_at DESC`,
    [contact.id, user.id]
  );
  return res.status(200).json({
    permissions: rows.map(function (r) {
      return {
        folder_id: String(r.folder_id),
        can_request: !!r.can_request,
        auto_release_on_timeout: !!r.auto_release_on_timeout,
        countdown_hours: r.countdown_hours,
        updated_at: r.updated_at,
      };
    }),
  });
}

async function handlePut(req, res, user, contact) {
  if (contact.status === 'revoked') {
    return res.status(409).json({ error: 'Cannot set permissions on a revoked contact' });
  }

  const body = (await parseBody(req)) || {};
  const perms = Array.isArray(body.permissions) ? body.permissions : null;
  if (!perms) return res.status(400).json({ error: 'permissions array required' });
  if (perms.length > 50) return res.status(400).json({ error: 'Too many permissions (max 50)' });

  // Validate + collect folder_ids
  const clean = [];
  const folderIds = [];
  for (let i = 0; i < perms.length; i++) {
    const p = perms[i];
    if (!p || typeof p !== 'object') return res.status(400).json({ error: 'Invalid permission entry' });
    const folderId = parseInt(p.folder_id, 10);
    if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'Invalid folder_id' });
    const countdown = Number.isInteger(p.countdown_hours) ? p.countdown_hours : 48;
    if (countdown < MIN_HOURS || countdown > MAX_HOURS) {
      return res.status(400).json({ error: `countdown_hours must be ${MIN_HOURS}..${MAX_HOURS}` });
    }
    clean.push({
      folder_id: folderId,
      can_request: p.can_request === true,
      auto_release_on_timeout: p.auto_release_on_timeout === true,
      countdown_hours: countdown,
    });
    folderIds.push(folderId);
  }

  // Verify every folder belongs to the caller
  if (folderIds.length > 0) {
    const ok = await getMany(
      `SELECT id FROM vault_folders WHERE owner_user_id = $1 AND id = ANY($2::bigint[])`,
      [user.id, folderIds]
    );
    if (ok.length !== folderIds.length) {
      return res.status(400).json({ error: 'One or more folder_ids are invalid' });
    }
  }

  // Full replace: delete existing, then re-insert.
  await run(`DELETE FROM vault_contact_permissions WHERE contact_id = $1`, [contact.id]);
  for (let i = 0; i < clean.length; i++) {
    const p = clean[i];
    await run(
      `INSERT INTO vault_contact_permissions
        (contact_id, folder_id, can_request, auto_release_on_timeout, countdown_hours)
       VALUES ($1, $2, $3, $4, $5)`,
      [contact.id, p.folder_id, p.can_request, p.auto_release_on_timeout, p.countdown_hours]
    );
  }

  // Activate the contact the first time permissions are granted.
  if (clean.length > 0 && contact.status === 'pending') {
    await run(
      `UPDATE vault_trusted_contacts SET status = 'active', activated_at = NOW() WHERE id = $1 AND status = 'pending'`,
      [contact.id]
    );
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: 'contact.permissions.update',
    target_type: 'contact',
    target_id: contact.id,
    metadata: { permission_count: clean.length },
  });

  return res.status(200).json({ ok: true, count: clean.length });
}
