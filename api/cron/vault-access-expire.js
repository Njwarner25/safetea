/**
 * Cron: POST /api/cron/vault-access-expire
 *
 * Processes access requests where countdown_ends_at has passed and the
 * request is still pending. For each:
 *   - If the contact's permission has auto_release_on_timeout = true,
 *     flip status -> 'released' and (in slice 9) generate the export +
 *     share link. V1 just flips the status and emails the contact a stub
 *     URL; slice 9 replaces the URL with a real export share.
 *   - Otherwise flip status -> 'expired'. Contact is notified "no action".
 *
 * Also cleans up expired contact sessions so the table doesn't bloat.
 *
 * Invoked by Vercel cron on a short interval (every 15 minutes).
 */

'use strict';

const { cors } = require('../_utils/auth');
const { getMany, run } = require('../_utils/db');
const notifications = require('../../services/vault/notifications');
const audit = require('../../services/vault/audit');
const { generateFolderExport, purgeExpired } = require('../../services/vault/export');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Vercel cron sends `authorization: Bearer <CRON_SECRET>` header; we
  // validate so random callers can't trigger release logic.
  const expected = process.env.CRON_SECRET;
  const got = req.headers.authorization || '';
  if (!expected || got !== `Bearer ${expected}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Grab candidates. Tight LIMIT so a single cron tick doesn't melt.
    const candidates = await getMany(
      `SELECT ar.id, ar.contact_id, ar.owner_user_id, ar.folder_id,
              ar.countdown_ends_at,
              p.auto_release_on_timeout,
              tc.contact_email, tc.contact_name_enc
       FROM vault_access_requests ar
       LEFT JOIN vault_contact_permissions p
         ON p.contact_id = ar.contact_id AND p.folder_id = ar.folder_id
       JOIN vault_trusted_contacts tc ON tc.id = ar.contact_id
       WHERE ar.status = 'pending' AND ar.countdown_ends_at <= NOW()
       ORDER BY ar.countdown_ends_at ASC
       LIMIT 50`
    );

    const results = { processed: 0, released: 0, expired: 0 };

    for (let i = 0; i < candidates.length; i++) {
      const row = candidates[i];
      results.processed++;

      if (row.auto_release_on_timeout) {
        await run(
          `UPDATE vault_access_requests SET status = 'released', resolved_at = NOW() WHERE id = $1`,
          [row.id]
        );
        results.released++;

        // Slice 9: generate a real export + signed share URL.
        let shareUrl;
        let exportId = null;
        try {
          const result = await generateFolderExport({
            folderId: row.folder_id,
            ownerUserId: row.owner_user_id,
            triggeredBy: 'access_request',
            accessRequestId: row.id,
            expiresHours: 72,
          });
          shareUrl = result.shareUrl;
          exportId = result.exportId;
          await run(
            `UPDATE vault_access_requests SET release_export_id = $1 WHERE id = $2`,
            [exportId, row.id]
          );
        } catch (expErr) {
          console.error('[cron/vault-access-expire] export generation failed:', expErr && expErr.message);
          shareUrl = (process.env.PUBLIC_APP_URL || 'https://getsafetea.app').replace(/\/$/, '') +
            '/vault-request?share=' + encodeURIComponent(row.id) + '&status=export-failed';
        }

        notifications.sendAccessApproved(row.contact_email, null, '(folder released)', shareUrl)
          .catch(function () {});

        audit.write({
          actor_user_id: null,
          actor_role: 'system',
          action: audit.ACTIONS.ACCESS_RELEASE,
          target_type: 'access_request',
          target_id: row.id,
          folder_id: row.folder_id,
          metadata: { auto_release: true, export_id: exportId },
        });
      } else {
        await run(
          `UPDATE vault_access_requests SET status = 'expired', resolved_at = NOW() WHERE id = $1`,
          [row.id]
        );
        results.expired++;

        notifications.sendAccessDenied(row.contact_email, null).catch(function () {});

        audit.write({
          actor_user_id: null,
          actor_role: 'system',
          action: audit.ACTIONS.ACCESS_EXPIRE,
          target_type: 'access_request',
          target_id: row.id,
          folder_id: row.folder_id,
          metadata: { auto_release: false },
        });
      }
    }

    // Housekeeping: drop expired sessions.
    await run(`DELETE FROM vault_contact_sessions WHERE expires_at < NOW()`);

    // Slice 9 addition: purge expired export blobs (keeps rows for audit).
    let purge = { scanned: 0, purged: 0 };
    try { purge = await purgeExpired(); }
    catch (e) { console.warn('[cron/vault-access-expire] export purge failed:', e && e.message); }

    return res.status(200).json({ ok: true, ...results, exports_purged: purge.purged, exports_scanned: purge.scanned });
  } catch (err) {
    console.error('[cron/vault-access-expire] failed:', err);
    return res.status(500).json({ error: 'Cron failed', details: err && err.message });
  }
};
