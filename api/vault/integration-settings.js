/**
 * GET  /api/vault/integration-settings — read the caller's vault↔safety prefs
 * PUT  /api/vault/integration-settings
 *   Body: { folder_id: number|null, auto_release_on_checkin_timeout: bool }
 *
 * These prefs let Pulse/SOS/SafeLink drop a recording into the chosen
 * Vault folder and optionally auto-release it to a trusted contact if a
 * Pulse check-in times out. Nothing happens by default — both are
 * opt-in.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getUserVaultPrefs, setUserVaultPrefs } = require('../../services/vault/pulse-hook');
const audit = require('../../services/vault/audit');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });

  try {
    if (req.method === 'GET') {
      const prefs = await getUserVaultPrefs(user.id);
      return res.status(200).json({
        folder_id: prefs ? String(prefs.folder_id) : null,
        auto_release_on_checkin_timeout: !!(prefs && prefs.auto_release_on_checkin_timeout),
      });
    }

    if (req.method === 'PUT') {
      const body = (await parseBody(req)) || {};
      const folderId = body.folder_id == null ? null : parseInt(body.folder_id, 10);
      if (folderId !== null && (!Number.isInteger(folderId) || folderId <= 0)) {
        return res.status(400).json({ error: 'folder_id must be an integer or null' });
      }
      const autoRelease = body.auto_release_on_checkin_timeout === true;

      const updated = await setUserVaultPrefs(user.id, folderId, autoRelease);
      audit.write({
        req,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: 'integration.settings.update',
        target_type: folderId ? 'folder' : 'user',
        target_id: folderId,
        folder_id: folderId,
        metadata: { auto_release: autoRelease },
      });
      return res.status(200).json({
        folder_id: updated.folder_id ? String(updated.folder_id) : null,
        auto_release_on_checkin_timeout: updated.auto_release_on_checkin_timeout,
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/integration-settings] fatal:', err);
    return res.status(400).json({ error: err && err.message ? err.message : 'Server error' });
  }
};
