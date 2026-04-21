/**
 * SafeTea Safety Vault — audit log writer
 *
 * Every vault action — create, view, edit, delete, export, access-request
 * submitted/approved/denied/released, admin break-glass — writes a row to
 * vault_audit_log via this helper.
 *
 * The audit table is append-only at the database layer (see migrate-vault.js
 * — a BEFORE UPDATE/DELETE trigger raises). This helper enforces nothing on
 * its own; it simply produces well-structured INSERTs so every site writes
 * the same shape.
 *
 * Never throws in the hot path: audit failures are logged and swallowed so a
 * broken audit write doesn't break the user-facing operation. That's a
 * deliberate tradeoff — losing an audit row is bad; denying a user their own
 * vault is worse. Operational: monitor for spikes in "audit write failed"
 * log lines and investigate.
 */

'use strict';

const crypto = require('crypto');
const { run } = require('../../api/_utils/db');

/**
 * Canonical action names. Not a strict allowlist — handlers can pass any
 * string — but use these when possible so log filters don't drift.
 */
const ACTIONS = Object.freeze({
  FOLDER_CREATE:        'folder.create',
  FOLDER_VIEW:          'folder.view',
  FOLDER_UPDATE:        'folder.update',
  FOLDER_DELETE:        'folder.delete',
  FOLDER_ARCHIVE:       'folder.archive',
  FOLDER_LEGAL_HOLD:    'folder.legal_hold',
  ENTRY_CREATE:         'entry.create',
  ENTRY_VIEW:           'entry.view',
  ENTRY_UPDATE:         'entry.update',
  ENTRY_DELETE:         'entry.delete',
  FILE_UPLOAD:          'file.upload',
  FILE_DOWNLOAD:        'file.download',
  FILE_DELETE:          'file.delete',
  CONTACT_INVITE:       'contact.invite',
  CONTACT_ACTIVATE:     'contact.activate',
  CONTACT_REVOKE:       'contact.revoke',
  ACCESS_REQUEST:       'access_request.submit',
  ACCESS_APPROVE:       'access_request.approve',
  ACCESS_DENY:          'access_request.deny',
  ACCESS_EXPIRE:        'access_request.expire',
  ACCESS_RELEASE:       'access_request.release',
  EXPORT_GENERATE:      'export.generate',
  EXPORT_DOWNLOAD:      'export.download',
  EXPORT_PURGE:         'export.purge',
  BREAK_GLASS_REQUEST:  'admin.break_glass.request',
  BREAK_GLASS_ACCESS:   'admin.break_glass.access',
  AI_ORGANIZE:          'ai.organize',
  AI_ASSIST:            'ai.assist',
});

/**
 * Hash the caller's IP before writing it. We want to correlate events from
 * the same IP without persisting the IP itself — SAMHSA-style minimization.
 * Uses a server-side pepper so logs can't be rainbow-tabled back to raw IPs
 * without the pepper (which isn't exfiltrable via the DB alone).
 */
function hashIp(ip) {
  if (!ip) return null;
  const pepper = process.env.VAULT_AUDIT_IP_PEPPER || 'safetea-vault-audit';
  return crypto.createHash('sha256').update(pepper + '|' + ip).digest('hex');
}

/**
 * Extract the client IP from a request without choking on proxy chains.
 * Keeps the first entry of X-Forwarded-For if present, else falls back to
 * req.socket.remoteAddress.
 */
function clientIp(req) {
  try {
    const xff = req && req.headers && (req.headers['x-forwarded-for'] || req.headers['X-Forwarded-For']);
    if (xff) return String(xff).split(',')[0].trim();
    if (req && req.socket && req.socket.remoteAddress) return req.socket.remoteAddress;
  } catch (_) {}
  return null;
}

/**
 * Write an audit row.
 *
 * Required fields:
 *   actor_user_id — authenticated user's id (or null for system events)
 *   actor_role    — 'owner' | 'contact' | 'admin' | 'system'
 *   action        — from ACTIONS or any string
 *   target_type   — 'folder' | 'entry' | 'file' | 'contact' | 'access_request' | 'export'
 *
 * Optional:
 *   target_id, folder_id, metadata (JSON-serializable object), req (to pull IP/UA)
 *
 * Never throws. Errors are logged.
 */
async function write(fields) {
  try {
    const {
      actor_user_id = null,
      actor_role = 'system',
      action,
      target_type,
      target_id = null,
      folder_id = null,
      metadata = {},
      req = null,
    } = fields || {};

    if (!action || !target_type) {
      console.warn('[vault.audit] skipped: missing action or target_type', { action, target_type });
      return;
    }

    const ua = req && req.headers ? (req.headers['user-agent'] || req.headers['User-Agent'] || null) : null;
    const ip_hash = hashIp(clientIp(req));

    await run(
      `INSERT INTO vault_audit_log
        (actor_user_id, actor_role, action, target_type, target_id, folder_id,
         ip_hash, user_agent, metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)`,
      [
        actor_user_id,
        actor_role,
        action,
        target_type,
        target_id,
        folder_id,
        ip_hash,
        ua,
        JSON.stringify(metadata || {}),
      ]
    );
  } catch (err) {
    // Fail open: audit must never block the user operation.
    console.error('[vault.audit] write failed:', err && err.message ? err.message : err);
  }
}

module.exports = { write, ACTIONS };
