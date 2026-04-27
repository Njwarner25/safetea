/**
 * GET /api/cron/ban-attempts-digest
 *
 * Daily digest of banned-IP / banned-device signup + login attempts.
 *
 * Reads banned_signup_attempts where notified_at IS NULL, groups by
 * ip + device + reason for readability, emails njwarner25@gmail.com,
 * and stamps notified_at on the rows it sent. If there are zero
 * unsent rows, no email is sent — quiet days stay quiet.
 *
 * Auth: Vercel cron only (x-vercel-cron header) OR
 *       x-migrate-secret for manual dispatch during testing.
 *
 * Schedule: once daily at 08:00 UTC, configured in vercel.json.
 */

'use strict';

const { getMany, run } = require('../_utils/db');
const emailSvc = require('../../services/email');

const ADMIN_EMAIL = 'njwarner25@gmail.com';

function fmtRow(r) {
  const when = r.created_at ? new Date(r.created_at).toISOString() : '?';
  const ip = r.ip || '(no ip)';
  const dev = r.device_hash ? r.device_hash.slice(0, 12) + '…' : '(no device)';
  const ua = r.user_agent ? String(r.user_agent).slice(0, 80) : '(no UA)';
  const email = r.attempted_email || '(no email)';
  return `  • ${when}  ${r.action.toUpperCase()}  reason=${r.blocked_reason}\n      ip=${ip}  device=${dev}\n      email=${email}\n      ua=${ua}`;
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const isCron = !!req.headers['x-vercel-cron'];
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!isCron && secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const rows = await getMany(
      `SELECT id, ip, device_hash, user_agent, attempted_email, action, blocked_reason, created_at
       FROM banned_signup_attempts
       WHERE notified_at IS NULL
       ORDER BY created_at ASC
       LIMIT 1000`,
      []
    );

    if (!rows.length) {
      return res.status(200).json({ ok: true, sent: false, count: 0, reason: 'nothing_new' });
    }

    // Build a compact, scan-friendly digest body.
    const byIp = {};
    for (const r of rows) {
      const key = (r.ip || '∅') + '|' + (r.blocked_reason || '∅');
      byIp[key] = (byIp[key] || 0) + 1;
    }
    const grouped = Object.keys(byIp)
      .sort(function (a, b) { return byIp[b] - byIp[a]; })
      .map(function (k) { return '  • ' + k.replace('|', '  reason=') + '  ×' + byIp[k]; })
      .join('\n');

    const detail = rows.map(fmtRow).join('\n');

    const subject = `[SafeTea] ${rows.length} banned-IP/device signup attempt${rows.length === 1 ? '' : 's'}`;
    const text =
      `${rows.length} blocked attempt${rows.length === 1 ? '' : 's'} since the last digest.\n\n` +
      `Top offenders (ip + reason):\n${grouped}\n\n` +
      `Full list:\n${detail}\n\n` +
      `These rows are now marked notified_at = NOW(). Query them anytime in banned_signup_attempts.`;
    const html = `<pre style="font-family:monospace;font-size:12px;white-space:pre-wrap;">${String(text).replace(/</g, '&lt;')}</pre>`;

    let emailResult = null;
    try {
      emailResult = await emailSvc.sendEmail({ to: ADMIN_EMAIL, subject: subject, text: text, html: html });
    } catch (e) {
      emailResult = { success: false, reason: e && e.message };
    }

    if (emailResult && emailResult.success) {
      const ids = rows.map(function (r) { return r.id; });
      await run(`UPDATE banned_signup_attempts SET notified_at = NOW() WHERE id = ANY($1::int[])`, [ids]);
    }

    return res.status(200).json({
      ok: true,
      sent: !!(emailResult && emailResult.success),
      count: rows.length,
      email_result: emailResult,
    });
  } catch (err) {
    console.error('[cron/ban-attempts-digest]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
