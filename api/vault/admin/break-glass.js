/**
 * POST /api/vault/admin/break-glass
 *   Body: { folder_id, reason, grant_hours? }
 *
 * Founder-only emergency access to a folder's decrypted content. Per the
 * Vault V1 gating decisions: founder's user_id is the only break-glass
 * principal until we have a 2-of-N approval flow (V2).
 *
 * Side effects:
 *   - Writes BREAK_GLASS_REQUEST + BREAK_GLASS_ACCESS audit rows
 *   - Sends a non-dismissible inbox notice (is_system=true,
 *     system_type='vault_break_glass') to the folder owner
 *   - Returns a short-lived (default 1h) decrypt token tied to the
 *     admin's user id and the target folder
 *
 * The decrypt itself happens on a separate endpoint (next slice); this
 * endpoint issues the token and logs the event. The separation keeps
 * this audit-first even if the decrypt never runs.
 *
 * Env:
 *   VAULT_BREAK_GLASS_USER_ID — founder's user_id (string). Hard gate.
 *   If unset, the endpoint is disabled.
 */

'use strict';

const crypto = require('crypto');
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

  const founderId = process.env.VAULT_BREAK_GLASS_USER_ID;
  if (!founderId) {
    return res.status(503).json({ error: 'Break-glass is not configured' });
  }
  if (String(user.id) !== String(founderId)) {
    return res.status(403).json({ error: 'Only the designated founder account can use break-glass.' });
  }

  const body = (await parseBody(req)) || {};
  const folderId = parseInt(body.folder_id, 10);
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  const hours = Number.isInteger(body.grant_hours) ? body.grant_hours : 1;

  if (!Number.isInteger(folderId) || folderId <= 0) return res.status(400).json({ error: 'folder_id required' });
  if (reason.length < 20) return res.status(400).json({ error: 'Written justification must be at least 20 characters.' });
  if (hours < 1 || hours > 24) return res.status(400).json({ error: 'grant_hours must be 1..24' });

  try {
    const folder = await getOne(
      `SELECT id, owner_user_id FROM vault_folders WHERE id = $1`,
      [folderId]
    );
    if (!folder) return res.status(404).json({ error: 'Folder not found' });

    // Record the REQUEST first (append-only audit — this is the legal record)
    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'admin',
      action: audit.ACTIONS.BREAK_GLASS_REQUEST,
      target_type: 'folder',
      target_id: folder.id,
      folder_id: folder.id,
      metadata: { reason: reason, grant_hours: hours },
    });

    // Issue the access token (opaque, short-lived). This token is the
    // bearer for the follow-up decrypt endpoint.
    const token = crypto.randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + hours * 3600 * 1000);

    // We don't have a dedicated break_glass_tokens table in V1; embed the
    // state into the audit metadata + vault_contact_sessions (repurposing
    // the short-lived-session table). contact_id = folder owner, token =
    // the hash of the bearer. A proper table can land in V2 if the
    // operational need grows.
    await run(
      `INSERT INTO vault_contact_sessions (token, contact_id, expires_at)
       VALUES ($1, $2, $3)`,
      [
        crypto.createHash('sha256').update(token).digest('hex').slice(0, 43),
        // We don't have a true contact record — abuse the column to store
        // the admin user_id negated so it doesn't collide with a real id.
        -Math.abs(user.id),
        expiresAt,
      ]
    ).catch(function () { /* table may not have a -ve FK tolerance; skip on fail */ });

    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'admin',
      action: audit.ACTIONS.BREAK_GLASS_ACCESS,
      target_type: 'folder',
      target_id: folder.id,
      folder_id: folder.id,
      metadata: { expires_at: expiresAt.toISOString() },
    });

    // Inbox notice to owner — non-dismissible (client honors is_system)
    try {
      await run(
        `ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false`
      );
      await run(
        `ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_type VARCHAR(40)`
      );
    } catch (_) {}
    try {
      const notice =
        '⚠️ Privileged access to your Safety Vault\n\n' +
        'A SafeTea administrator invoked the break-glass workflow on one of your Vault folders.\n\n' +
        `Reason on record: ${reason}\n\n` +
        `Access window: ${hours} hour${hours === 1 ? '' : 's'} (expires ${expiresAt.toLocaleString()})\n\n` +
        'This event is logged permanently in your Vault activity log. If you believe this access was unauthorized, email support@getsafetea.app.';
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at)
         VALUES ($1, $1, $2, true, 'vault_break_glass', NOW())`,
        [folder.owner_user_id, notice]
      );
    } catch (e) {
      console.warn('[vault/admin/break-glass] inbox notice failed:', e && e.message);
    }

    return res.status(200).json({
      ok: true,
      token: token,
      expires_at: expiresAt.toISOString(),
      warning: 'This access is logged in the vault audit log. Every decrypt will be recorded.',
    });
  } catch (err) {
    console.error('[vault/admin/break-glass] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
