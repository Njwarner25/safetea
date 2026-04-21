/**
 * POST /api/vault/admin/legal-hold
 *   Body: { target_type: 'folder'|'entry', target_id, on: boolean, reason }
 *
 * Admin-only. Sets or releases legal_hold on a folder or entry. Owners
 * cannot toggle this themselves (spec §14). Every change writes an audit
 * row and notifies the folder owner via their inbox.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const audit = require('../../../services/vault/audit');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const body = (await parseBody(req)) || {};
  const targetType = body.target_type;
  const targetId = parseInt(body.target_id, 10);
  const on = body.on === true;
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';

  if (['folder', 'entry'].indexOf(targetType) === -1) {
    return res.status(400).json({ error: 'target_type must be folder or entry' });
  }
  if (!Number.isInteger(targetId) || targetId <= 0) {
    return res.status(400).json({ error: 'target_id required' });
  }
  if (reason.length < 20) {
    return res.status(400).json({ error: 'Reason must be at least 20 characters' });
  }

  try {
    let folderId;
    let ownerId;
    if (targetType === 'folder') {
      const row = await getOne(
        `SELECT id, owner_user_id FROM vault_folders WHERE id = $1`, [targetId]
      );
      if (!row) return res.status(404).json({ error: 'Folder not found' });
      folderId = row.id; ownerId = row.owner_user_id;
      await run(
        `UPDATE vault_folders SET legal_hold = $2, updated_at = NOW() WHERE id = $1`,
        [targetId, on]
      );
    } else {
      const row = await getOne(
        `SELECT e.id, e.folder_id, f.owner_user_id
         FROM vault_entries e JOIN vault_folders f ON f.id = e.folder_id
         WHERE e.id = $1`, [targetId]
      );
      if (!row) return res.status(404).json({ error: 'Entry not found' });
      folderId = row.folder_id; ownerId = row.owner_user_id;
      await run(
        `UPDATE vault_entries SET legal_hold = $2, updated_at = NOW() WHERE id = $1`,
        [targetId, on]
      );
    }

    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'admin',
      action: audit.ACTIONS.FOLDER_LEGAL_HOLD,
      target_type: targetType,
      target_id: targetId,
      folder_id: folderId,
      metadata: { on: on, reason: reason },
    });

    // Owner inbox notice — not dismissible, tagged as system
    try {
      const verb = on ? 'placed' : 'released';
      const body =
        `⚖️ Legal hold ${verb} on a Vault ${targetType}\n\n` +
        `A SafeTea administrator ${verb} a legal hold on one of your Vault ${targetType}s. ` +
        `While a hold is active, the ${targetType} cannot be deleted and new entries in a held folder are blocked.\n\n` +
        `Reason on record: ${reason}\n\n` +
        'This event is permanently logged in your Vault activity log. If you believe this is an error, contact support@getsafetea.app.';
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at)
         VALUES ($1, $1, $2, true, 'vault_legal_hold', NOW())`,
        [ownerId, body]
      );
    } catch (e) {
      console.warn('[vault/admin/legal-hold] inbox notice failed:', e && e.message);
    }

    return res.status(200).json({ ok: true, on: on });
  } catch (err) {
    console.error('[vault/admin/legal-hold] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
