/**
 * GET /api/account/restore?token=<hmac>&u=<userId>
 *
 * Verifies the HMAC token issued by /api/account/delete and clears
 * users.deletion_scheduled_at. Renders a simple HTML confirmation page so the
 * link works from any email client.
 *
 * The token = HMAC-SHA256('delete-undo:<userId>', JWT_SECRET). No DB-side
 * token storage — the server recomputes and compares with timingSafeEqual.
 */

const crypto = require('crypto');
const { cors, JWT_SECRET } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const SITE_BASE = (process.env.PUBLIC_APP_URL || 'https://www.getsafetea.app').replace(/\/$/, '');

function computeToken(userId) {
  const secret = JWT_SECRET || process.env.JWT_SECRET || 'safetea-undo-fallback';
  return crypto
    .createHmac('sha256', secret)
    .update('delete-undo:' + String(userId))
    .digest('hex');
}

function safeEq(a, b) {
  try {
    const ba = Buffer.from(String(a), 'hex');
    const bb = Buffer.from(String(b), 'hex');
    if (ba.length !== bb.length) return false;
    return crypto.timingSafeEqual(ba, bb);
  } catch (_) {
    return false;
  }
}

function htmlPage(title, body, statusOk) {
  const accent = statusOk ? '#2ecc71' : '#e74c3c';
  return `<!DOCTYPE html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:-apple-system,BlinkMacSystemFont,'Inter',Helvetica,Arial,sans-serif;background:#0D0D1A;color:#fff;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
  .card{max-width:480px;width:100%;background:#22223A;border:1px solid rgba(255,255,255,0.06);border-radius:16px;padding:32px 28px;text-align:center}
  .icon{width:56px;height:56px;border-radius:50%;background:${accent}26;color:${accent};display:flex;align-items:center;justify-content:center;font-size:28px;margin:0 auto 16px}
  h1{font-size:22px;margin-bottom:10px;color:${accent}}
  p{color:#C0C0D8;line-height:1.55;font-size:14px;margin-bottom:14px}
  a.btn{display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:13px 30px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;margin-top:8px}
  .small{color:#666;font-size:12px;margin-top:18px}
</style></head>
<body><div class="card">${body}</div></body></html>`;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const token = (req.query && req.query.token) || '';
  const userIdRaw = (req.query && req.query.u) || '';
  const userId = parseInt(userIdRaw, 10);

  res.setHeader('Content-Type', 'text/html; charset=utf-8');

  if (!token || !Number.isInteger(userId) || userId <= 0) {
    return res.status(400).send(htmlPage(
      'Invalid restore link',
      `<div class="icon">!</div>
       <h1>Link is invalid</h1>
       <p>This restore link is malformed or missing required parameters.</p>
       <p>If you need help, contact <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support@getsafetea.app</a>.</p>`,
      false
    ));
  }

  const expected = computeToken(userId);
  if (!safeEq(token, expected)) {
    return res.status(403).send(htmlPage(
      'Invalid restore link',
      `<div class="icon">!</div>
       <h1>Link is invalid or expired</h1>
       <p>We couldn't verify this restore link. It may have been tampered with, or your account may have already been deleted.</p>
       <p>If you need help, contact <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support@getsafetea.app</a>.</p>`,
      false
    ));
  }

  try {
    const row = await getOne(
      `SELECT id, email, deletion_scheduled_at FROM users WHERE id = $1`,
      [userId]
    );

    if (!row) {
      // Could mean the cron already ran and purged the row.
      return res.status(410).send(htmlPage(
        'Account already deleted',
        `<div class="icon">&times;</div>
         <h1>This account has already been deleted</h1>
         <p>The 30-day grace period has ended and the data was permanently removed.</p>
         <p>You're welcome to <a href="${SITE_BASE}/join.html" style="color:#E8A0B5;">create a new account</a> any time.</p>`,
        false
      ));
    }

    if (!row.deletion_scheduled_at) {
      // Nothing to undo — but treat this as success so the user sees a
      // friendly page instead of an error.
      return res.status(200).send(htmlPage(
        'Account is active',
        `<div class="icon">&#10003;</div>
         <h1>Your account is active</h1>
         <p>No deletion was scheduled for this account. You can keep using it as normal.</p>
         <a class="btn" href="${SITE_BASE}/login.html">Sign in</a>`,
        true
      ));
    }

    await run(
      `UPDATE users SET deletion_scheduled_at = NULL WHERE id = $1`,
      [userId]
    );

    return res.status(200).send(htmlPage(
      'Account restored',
      `<div class="icon">&#10003;</div>
       <h1>Welcome back</h1>
       <p>Your account is restored. Nothing was deleted.</p>
       <p style="color:#8080A0;font-size:13px;">Note: your subscription was canceled when you requested deletion. You can re-subscribe any time from the dashboard.</p>
       <a class="btn" href="${SITE_BASE}/login.html">Sign in</a>
       <div class="small">If this wasn't you, change your password immediately and contact support.</div>`,
      true
    ));
  } catch (err) {
    console.error('[account/restore] error:', err && err.message);
    return res.status(500).send(htmlPage(
      'Something went wrong',
      `<div class="icon">!</div>
       <h1>Restore failed</h1>
       <p>We hit an unexpected error. Please try the link again, or contact
       <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support@getsafetea.app</a>.</p>`,
      false
    ));
  }
};
