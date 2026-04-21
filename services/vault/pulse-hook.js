/**
 * SafeTea Safety Vault — integration helpers for Pulse / SOS / SafeLink.
 *
 * The real Pulse/SOS/SafeLink handlers can import these without taking a
 * dependency on the full Vault internals. Both functions fail soft —
 * they never throw into the safety path. If the user hasn't opted in,
 * the helpers no-op cleanly.
 *
 * Exposed:
 *   getUserVaultPrefs(userId)
 *     -> { folder_id, auto_release_on_checkin_timeout } | null
 *
 *   attachSessionRecordingToVault({ userId, blobUrl, mimeType, byteSize, filename })
 *     Drops an audio entry + vault_files row into the user's configured
 *     folder. Blob URL must already be in Vercel Blob (we do NOT download
 *     + re-upload here). Returns { ok, entry_id?, file_id? }.
 *
 *   fireAutoReleaseOnCheckinTimeout({ userId, reason })
 *     If the user opted in AND has a pre-authorized trusted contact on
 *     the configured folder with auto_release_on_timeout=true, generates
 *     an export and emails the contact. Returns { released, export_id? }.
 */

'use strict';

const { getOne, getMany, run } = require('../../api/_utils/db');
const { encryptField, unwrapFolderKey, fileChecksum } = require('./encryption');
const { generateFolderExport } = require('./export');
const notifications = require('./notifications');
const audit = require('./audit');

async function ensureUserColumns() {
  try { await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_sos_folder_id BIGINT`); } catch (_) {}
  try { await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS vault_auto_release_on_checkin_timeout BOOLEAN DEFAULT false`); } catch (_) {}
}

async function getUserVaultPrefs(userId) {
  await ensureUserColumns();
  const row = await getOne(
    `SELECT vault_sos_folder_id AS folder_id,
            COALESCE(vault_auto_release_on_checkin_timeout, false) AS auto_release
     FROM users WHERE id = $1`,
    [userId]
  );
  if (!row || !row.folder_id) return null;
  return {
    folder_id: row.folder_id,
    auto_release_on_checkin_timeout: !!row.auto_release,
  };
}

async function setUserVaultPrefs(userId, folderId, autoRelease) {
  await ensureUserColumns();

  // Verify the folder belongs to the caller (or null to clear).
  if (folderId) {
    const folder = await getOne(
      `SELECT id FROM vault_folders WHERE id = $1 AND owner_user_id = $2 AND archived = false`,
      [folderId, userId]
    );
    if (!folder) throw new Error('Folder not found or not owned by this user');
  }

  await run(
    `UPDATE users
     SET vault_sos_folder_id = $2,
         vault_auto_release_on_checkin_timeout = $3
     WHERE id = $1`,
    [userId, folderId || null, !!autoRelease]
  );
  return { folder_id: folderId || null, auto_release_on_checkin_timeout: !!autoRelease };
}

/**
 * Best-effort attachment of a completed SOS / Pulse recording to the user's
 * configured vault folder. Safe to call with anything; fails open.
 */
async function attachSessionRecordingToVault(opts) {
  try {
    const userId = parseInt(opts && opts.userId, 10);
    if (!Number.isInteger(userId) || userId <= 0) return { ok: false, reason: 'bad user' };

    const prefs = await getUserVaultPrefs(userId);
    if (!prefs) return { ok: false, reason: 'not_configured' };

    const folder = await getOne(
      `SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag, legal_hold, archived
       FROM vault_folders WHERE id = $1`,
      [prefs.folder_id]
    );
    if (!folder || folder.owner_user_id !== userId || folder.archived) {
      return { ok: false, reason: 'folder_unavailable' };
    }
    if (folder.legal_hold) {
      return { ok: false, reason: 'legal_hold' };
    }

    const caption = typeof opts.caption === 'string' ? opts.caption :
      'Recording captured from a SafeTea safety session on ' + new Date().toISOString();
    const mimeType = typeof opts.mimeType === 'string' ? opts.mimeType : 'audio/webm';
    const byteSize = Number(opts.byteSize) || 0;
    const filename = typeof opts.filename === 'string' ? opts.filename : 'safety-session.webm';
    const blobUrl = typeof opts.blobUrl === 'string' ? opts.blobUrl : null;

    const dek = unwrapFolderKey(folder);
    let entry, file;
    try {
      entry = await getOne(
        `INSERT INTO vault_entries (folder_id, owner_user_id, entry_type, content_enc, tags)
         VALUES ($1, $2, 'audio', $3, ARRAY['safety-session'])
         RETURNING id`,
        [prefs.folder_id, userId, encryptField(dek, caption)]
      );

      if (blobUrl) {
        file = await getOne(
          `INSERT INTO vault_files
            (entry_id, folder_id, uploader_user_id, storage_key, mime_type,
             byte_size, checksum_sha256, filename_enc)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING id`,
          [
            entry.id, prefs.folder_id, userId,
            encryptField(dek, blobUrl),
            mimeType, byteSize,
            fileChecksum(Buffer.from(blobUrl)).slice(0, 64),
            encryptField(dek, filename),
          ]
        );
      }
    } finally {
      dek.fill(0);
    }

    audit.write({
      actor_user_id: userId,
      actor_role: 'system',
      action: audit.ACTIONS.ENTRY_CREATE,
      target_type: 'entry',
      target_id: entry.id,
      folder_id: prefs.folder_id,
      metadata: { source: opts.source || 'safety_session', file_id: file ? file.id : null },
    });

    return { ok: true, entry_id: String(entry.id), file_id: file ? String(file.id) : null };
  } catch (err) {
    console.error('[vault/pulse-hook] attach failed:', err && err.message);
    return { ok: false, reason: 'error' };
  }
}

/**
 * If the user opted in AND has a trusted contact on that folder with
 * auto_release_on_timeout=true, generate an export and email the contact
 * their share link. Safe to call with any user id.
 */
async function fireAutoReleaseOnCheckinTimeout(opts) {
  try {
    const userId = parseInt(opts && opts.userId, 10);
    if (!Number.isInteger(userId) || userId <= 0) return { released: false };

    const prefs = await getUserVaultPrefs(userId);
    if (!prefs || !prefs.auto_release_on_checkin_timeout) return { released: false, reason: 'not_opted_in' };

    // Find any contact with auto_release_on_timeout=true permission on this folder.
    const contacts = await getMany(
      `SELECT tc.id AS contact_id, tc.contact_email, tc.contact_name_enc
       FROM vault_contact_permissions p
       JOIN vault_trusted_contacts tc ON tc.id = p.contact_id
       WHERE p.folder_id = $1
         AND p.auto_release_on_timeout = true
         AND p.can_request = true
         AND tc.status = 'active'`,
      [prefs.folder_id]
    );
    if (!contacts.length) return { released: false, reason: 'no_contacts' };

    const results = [];
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i];
      try {
        const result = await generateFolderExport({
          folderId: prefs.folder_id,
          ownerUserId: userId,
          triggeredBy: 'checkin_timeout',
          expiresHours: 72,
        });
        notifications
          .sendAccessApproved(c.contact_email, null, '(Safety check-in timeout)', result.shareUrl)
          .catch(function () {});
        results.push({ contact_id: String(c.contact_id), export_id: result.exportId });

        audit.write({
          actor_user_id: null,
          actor_role: 'system',
          action: audit.ACTIONS.ACCESS_RELEASE,
          target_type: 'export',
          target_id: result.exportId,
          folder_id: prefs.folder_id,
          metadata: { trigger: 'checkin_timeout', reason: opts.reason || null, contact_id: c.contact_id },
        });
      } catch (e) {
        console.error('[vault/pulse-hook] auto-release failed for contact', c.contact_id, e && e.message);
      }
    }

    return { released: results.length > 0, count: results.length, results };
  } catch (err) {
    console.error('[vault/pulse-hook] fireAutoReleaseOnCheckinTimeout failed:', err && err.message);
    return { released: false, reason: 'error' };
  }
}

module.exports = {
  getUserVaultPrefs,
  setUserVaultPrefs,
  attachSessionRecordingToVault,
  fireAutoReleaseOnCheckinTimeout,
};
