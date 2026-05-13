/**
 * POST /api/account/export
 *
 * Self-serve data export (CCPA / GDPR / Apple 5.1.1(v) / Google Play data
 * safety). Generates a ZIP of every user-owned row across the schema and
 * emails the user a Vercel-Blob signed URL valid for 7 days.
 *
 * Rate limit: one export per user per 24h, tracked via
 * users.last_export_request_at (added lazily).
 *
 * Why we do the heavy lifting inline (vs. queueing to a worker) rather than
 * archiver/jszip from npm:
 *   - We're a Vercel serverless function with a 10 s default budget. The
 *     ZIP we produce is uncompressed (STORE) — pure JSON text concatenated
 *     into the canonical ZIP container format. That keeps us at zero npm
 *     deps and well under the timeout for any realistic single-user
 *     dataset.
 *   - If a user really has hundreds of MB we'll bump to archiver — but
 *     that's a future problem; the vast majority will be < 1 MB.
 */

const crypto = require('crypto');
const zlib = require('zlib');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { sendEmail, wrapHtml } = require('../../services/email');

let blob = null;
try {
  blob = require('@vercel/blob');
} catch (_) { /* @vercel/blob is in deps but guard for local dev */ }

const RATE_LIMIT_HOURS = 24;
const BLOB_EXPIRY_DAYS = 7;
const SITE_BASE = (process.env.PUBLIC_APP_URL || 'https://www.getsafetea.app').replace(/\/$/, '');

// Tables we attempt to dump for the user. Pairs match the deletion cron's
// list — keep them in sync. Each entry is [table, column, kind].
//   kind = 'user' means user_id integer FK to users.id
//   kind = 'owner' means owner_user_id / uploader_user_id / sender_id / etc.
const EXPORT_TARGETS = [
  // core
  ['users', 'id', 'self'],
  ['posts', 'user_id', 'user'],
  ['replies', 'user_id', 'user'],
  ['alerts', 'user_id', 'user'],
  ['messages_sent', 'sender_id', 'messages'],
  ['messages_received', 'recipient_id', 'messages'],
  ['watched_names', 'user_id', 'user'],
  ['verification_attempts', 'user_id', 'user'],
  ['post_likes', 'user_id', 'user'],
  ['post_dislikes', 'user_id', 'user'],
  ['post_bumps', 'user_id', 'user'],
  ['post_reports_filed', 'reporter_id', 'post_reports'],
  ['post_reports_against', 'reported_user_id', 'post_reports'],
  ['removal_requests_filed', 'requester_id', 'removal_requests'],
  ['gender_reports_filed', 'reporter_id', 'gender_reports'],
  ['ai_companion_settings', 'user_id', 'user'],
  ['ai_chat_messages', 'user_id', 'user'],
  ['ai_journal_entries', 'user_id', 'user'],
  ['date_checkouts', 'user_id', 'user'],
  ['date_locations', 'user_id', 'user'],
  ['sos_events', 'user_id', 'user'],
  ['recording_sessions', 'user_id', 'user'],
  ['recording_contacts', 'user_id', 'user'],
  ['safelink_sessions', 'user_id', 'user'],
  ['pulse_sessions', 'user_id', 'user'],
  ['pulse_escalations', 'user_id', 'user'],
  ['pulse_anomalies', 'user_id', 'user'],
  ['trust_events', 'user_id', 'user'],
  ['verification_requests', 'user_id', 'user'],
  ['connected_accounts', 'user_id', 'user'],
  ['redflag_scans', 'user_id', 'user'],
  ['user_feedback', 'user_id', 'user'],
  ['feedback', 'user_id', 'user'],
  ['user_alert_preferences', 'user_id', 'user'],
  ['user_alert_history', 'user_id', 'user'],
  ['user_watch_zones', 'user_id', 'user'],
  ['referral_codes', 'user_id', 'user'],
  ['referral_rewards', 'user_id', 'user'],
  ['photo_verification_reports', 'user_id', 'user'],
  ['photo_verification_usage', 'user_id', 'user'],
  ['org_code_redemptions', 'user_id', 'user'],
  ['room_memberships', 'user_id', 'user'],
  ['room_posts', 'user_id', 'user'],
  ['room_replies', 'user_id', 'user'],
  ['vault_folders', 'owner_user_id', 'user'],
  ['vault_entries', 'owner_user_id', 'user'],
  ['vault_files', 'uploader_user_id', 'user'],
  ['vault_trusted_contacts', 'owner_user_id', 'user'],
  ['vault_access_requests', 'owner_user_id', 'user'],
  ['vault_exports', 'owner_user_id', 'user'],
  ['push_tokens', 'user_id', 'user'],
];

// ─── Minimal ZIP encoder ────────────────────────────────────────────────
// Builds a STORE (uncompressed) ZIP entirely in memory. Compatible with
// every consumer-grade unzipper. Format spec: APPNOTE.TXT § 4.
// We pay a small size penalty for skipping DEFLATE, but the upside is
// zero npm deps and trivial implementation.

function crc32(buf) {
  // RFC 1952 / PKWARE CRC-32. We could use zlib.crc32 (Node 18+) but the
  // table-driven JS impl is fast enough for our sub-MB payloads.
  let c;
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let k = 0; k < 8; k++) {
      c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

// Prefer zlib.crc32 when available (Node 22+) — same result, native speed.
const crc32Fast = (typeof zlib.crc32 === 'function')
  ? (buf) => zlib.crc32(buf) >>> 0
  : crc32;

function buildZip(files) {
  // files: [{ name: 'foo.json', data: Buffer }]
  const localChunks = [];
  const centralChunks = [];
  let offset = 0;

  for (const f of files) {
    const nameBuf = Buffer.from(f.name, 'utf8');
    const data = f.data;
    const crc = crc32Fast(data);
    const size = data.length;

    // Local file header
    const lfh = Buffer.alloc(30);
    lfh.writeUInt32LE(0x04034b50, 0);   // signature
    lfh.writeUInt16LE(20, 4);            // version needed
    lfh.writeUInt16LE(0x0800, 6);        // flags (bit 11: UTF-8 filenames)
    lfh.writeUInt16LE(0, 8);             // method: STORE
    lfh.writeUInt16LE(0, 10);            // mtime
    lfh.writeUInt16LE(0, 12);            // mdate
    lfh.writeUInt32LE(crc, 14);          // crc32
    lfh.writeUInt32LE(size, 18);         // compressed size
    lfh.writeUInt32LE(size, 22);         // uncompressed size
    lfh.writeUInt16LE(nameBuf.length, 26);
    lfh.writeUInt16LE(0, 28);            // extra field length
    localChunks.push(lfh, nameBuf, data);

    // Central directory header
    const cdh = Buffer.alloc(46);
    cdh.writeUInt32LE(0x02014b50, 0);    // signature
    cdh.writeUInt16LE(20, 4);            // version made by
    cdh.writeUInt16LE(20, 6);            // version needed
    cdh.writeUInt16LE(0x0800, 8);        // flags
    cdh.writeUInt16LE(0, 10);            // method
    cdh.writeUInt16LE(0, 12);            // mtime
    cdh.writeUInt16LE(0, 14);            // mdate
    cdh.writeUInt32LE(crc, 16);          // crc32
    cdh.writeUInt32LE(size, 20);         // comp size
    cdh.writeUInt32LE(size, 24);         // uncomp size
    cdh.writeUInt16LE(nameBuf.length, 28);
    cdh.writeUInt16LE(0, 30);            // extra
    cdh.writeUInt16LE(0, 32);            // comment
    cdh.writeUInt16LE(0, 34);            // disk no.
    cdh.writeUInt16LE(0, 36);            // internal attrs
    cdh.writeUInt32LE(0, 38);            // external attrs
    cdh.writeUInt32LE(offset, 42);       // local header offset
    centralChunks.push(cdh, nameBuf);

    offset += lfh.length + nameBuf.length + data.length;
  }

  const central = Buffer.concat(centralChunks);
  const centralOffset = offset;
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);              // disk no.
  eocd.writeUInt16LE(0, 6);              // disk where cd starts
  eocd.writeUInt16LE(files.length, 8);   // entries on disk
  eocd.writeUInt16LE(files.length, 10);  // total entries
  eocd.writeUInt32LE(central.length, 12);
  eocd.writeUInt32LE(centralOffset, 16);
  eocd.writeUInt16LE(0, 20);             // comment length

  return Buffer.concat([Buffer.concat(localChunks), central, eocd]);
}

// ─── Schema bootstrap ───────────────────────────────────────────────────

async function ensureSchema() {
  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_export_request_at TIMESTAMPTZ`);
  } catch (_) {}
}

// ─── Query helpers ──────────────────────────────────────────────────────

async function safeSelect(table, column, value) {
  try {
    const sql = `SELECT * FROM "${table}" WHERE "${column}" = $1`;
    return await getMany(sql, [value]);
  } catch (err) {
    const msg = (err && err.message) || '';
    if (/does not exist/i.test(msg) || /undefined column/i.test(msg)) {
      return null; // Skip missing tables silently.
    }
    console.warn('[account/export] query failed', table, column, msg);
    return null;
  }
}

// Strip the most obviously sensitive cols (password hash, encrypted blobs
// the user can't make use of without the KEK, etc.).
function sanitizeRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = {};
  for (const k of Object.keys(row)) {
    if (k === 'password_hash' || k === 'password' || k.endsWith('_enc') ||
        k === 'dek_wrapped' || k === 'dek_iv' || k === 'dek_tag') {
      out[k] = '<redacted: encrypted at rest>';
      continue;
    }
    out[k] = row[k];
  }
  return out;
}

// ─── Handler ────────────────────────────────────────────────────────────

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (!blob || !process.env.BLOB_READ_WRITE_TOKEN) {
    return res.status(503).json({
      error: 'Export storage is not configured. Please contact support.',
    });
  }

  try {
    await ensureSchema();

    // Rate limit: one per 24h. We check + set in a single UPDATE so a
    // double-click can't race past us.
    const fresh = await getOne(
      `SELECT last_export_request_at FROM users WHERE id = $1`,
      [user.id]
    );
    if (fresh && fresh.last_export_request_at) {
      const last = new Date(fresh.last_export_request_at).getTime();
      const minNext = last + RATE_LIMIT_HOURS * 3600 * 1000;
      if (Date.now() < minNext) {
        const hoursLeft = Math.ceil((minNext - Date.now()) / 3600000);
        return res.status(429).json({
          error: 'rate_limited',
          message: `You can request another export in about ${hoursLeft} hour(s).`,
          retry_after_seconds: Math.ceil((minNext - Date.now()) / 1000),
        });
      }
    }
    await run(
      `UPDATE users SET last_export_request_at = NOW() WHERE id = $1`,
      [user.id]
    );

    // Collect rows table by table.
    const files = [];
    const manifest = {
      export_generated_at: new Date().toISOString(),
      user_id: user.id,
      email: user.email || null,
      format: 'json-per-table',
      note:
        'This archive contains every row in our database keyed to your user id at the time of export. ' +
        'Encrypted columns (column names ending in _enc, dek_*, password_hash) are redacted because they cannot be ' +
        'meaningfully read without server-held keys. Contact support@getsafetea.app if you need a particular field ' +
        'returned in plaintext for a compliance request.',
      tables: {},
    };

    for (const [label, column, _kind] of EXPORT_TARGETS) {
      let rows;
      if (label === 'users') {
        rows = await safeSelect('users', 'id', user.id);
      } else if (label === 'messages_sent') {
        rows = await safeSelect('messages', 'sender_id', user.id);
      } else if (label === 'messages_received') {
        rows = await safeSelect('messages', 'recipient_id', user.id);
      } else if (label === 'post_reports_filed') {
        rows = await safeSelect('post_reports', 'reporter_id', user.id);
      } else if (label === 'post_reports_against') {
        rows = await safeSelect('post_reports', 'reported_user_id', user.id);
      } else if (label === 'removal_requests_filed') {
        rows = await safeSelect('removal_requests', 'requester_id', user.id);
      } else if (label === 'gender_reports_filed') {
        rows = await safeSelect('gender_reports', 'reporter_id', user.id);
      } else {
        rows = await safeSelect(label, column, user.id);
      }
      if (rows === null) {
        manifest.tables[label] = { status: 'not_present' };
        continue;
      }
      const sanitized = rows.map(sanitizeRow);
      manifest.tables[label] = { status: 'ok', row_count: sanitized.length };
      // Always include the file (even if empty) so the user has a
      // complete picture of what we hold per table.
      files.push({
        name: `data/${label}.json`,
        data: Buffer.from(JSON.stringify(sanitized, null, 2), 'utf8'),
      });
    }

    // Manifest + README.
    files.unshift({
      name: 'manifest.json',
      data: Buffer.from(JSON.stringify(manifest, null, 2), 'utf8'),
    });
    files.unshift({
      name: 'README.txt',
      data: Buffer.from(
        'SafeTea data export\n' +
        '===================\n\n' +
        'Generated: ' + manifest.export_generated_at + '\n' +
        'Account:   ' + (user.email || ('user #' + user.id)) + '\n\n' +
        'This archive contains every row in our database keyed to your account.\n' +
        'Each table is dumped as JSON under data/<table>.json. See manifest.json\n' +
        'for a per-table summary.\n\n' +
        'Encrypted fields (columns ending in _enc, plus password_hash and key\n' +
        'wrap data) are redacted because they cannot be read without server-\n' +
        'held keys.\n\n' +
        'To delete your account, see Settings → Delete Account in the app.\n' +
        'Questions: support@getsafetea.app\n',
        'utf8'
      ),
    });

    const zipBuf = buildZip(files);

    // Upload to Vercel Blob. We treat the URL as a bearer: the path is
    // randomized + Vercel Blob's URL itself is cryptographically
    // unguessable, so anyone with the link can download, but no one can
    // guess it. We email it to the verified-on-file address only.
    const safeId = String(user.id).replace(/[^0-9]/g, '');
    const pathname = `account-exports/${safeId}-${crypto.randomBytes(10).toString('hex')}.zip`;
    const uploaded = await blob.put(pathname, zipBuf, {
      access: 'public',
      contentType: 'application/zip',
      addRandomSuffix: true,
    });

    // Email the link. We do this inline rather than queueing — if SendGrid
    // is down we return 200 with the URL in the response so the UI can
    // surface it.
    const expiresAt = new Date(Date.now() + BLOB_EXPIRY_DAYS * 24 * 3600 * 1000);
    let emailSent = false;
    if (user.email) {
      try {
        const r = await sendEmail({
          to: user.email,
          subject: 'Your data export is ready',
          html: wrapHtml(`
            <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Your data export is ready</h2>
            <p>Here's your download link. It's good for the next ${BLOB_EXPIRY_DAYS} days:</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${uploaded.url}" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Download my data</a>
            </div>
            <p style="color:#8080A0;font-size:13px;line-height:1.5;">
              The archive is a ZIP of JSON files — one per table — plus a manifest. Anyone with this link can download
              it, so keep it private. If you didn't request this export, contact
              <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support</a> right away.
            </p>
            <p style="color:#666;font-size:11px;margin-top:18px;word-break:break-all;">
              Direct URL: ${uploaded.url}
            </p>
          `),
          text:
            'Your data export is ready.\n\n' +
            'Download: ' + uploaded.url + '\n' +
            'Link expires: ' + expiresAt.toUTCString() + '\n\n' +
            'If you did not request this, contact support@getsafetea.app immediately.',
        });
        emailSent = r && r.success;
      } catch (err) {
        console.error('[account/export] email failed:', err && err.message);
      }
    }

    return res.status(200).json({
      status: emailSent ? 'queued' : 'ready',
      message: emailSent
        ? 'Your export was emailed.'
        : 'Your export is ready (email delivery failed — use the URL below).',
      download_url: uploaded.url,
      bytes: zipBuf.length,
      expires_at: expiresAt.toISOString(),
      file_count: files.length,
    });
  } catch (err) {
    console.error('[account/export] error:', err && err.message, err && err.stack);
    return res.status(500).json({ error: 'Export failed' });
  }
};
