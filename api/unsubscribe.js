/**
 * Unsubscribe endpoint for marketing / drip emails.
 *
 * Called from /unsubscribe.html via GET or POST with:
 *   ?u=<user_id>&t=<token>
 *
 * Flips `users.email_opted_out = TRUE`. The drip cron treats opted-out
 * users as already-sent so we don't keep retrying. Transactional safety
 * mails (SOS, check-in reminders, account warnings) still go through —
 * those bypass this flag because they're not marketing.
 *
 * The token is a HMAC of the user_id with JWT_SECRET so a leaked email
 * link can't be reused to unsub other accounts and a guessed user_id
 * alone won't validate.
 */

const crypto = require('crypto');
const { run, getOne } = require('./_utils/db');
const { cors } = require('./_utils/auth');

function expectedToken(userId) {
  const secret = process.env.JWT_SECRET || 'safetea-unsub-fallback';
  return crypto.createHmac('sha256', secret).update('unsub:' + userId).digest('hex').slice(0, 24);
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const userId = parseInt(
    (req.query && req.query.u) ||
    (req.body && req.body.u) ||
    '',
    10
  );
  const token = (req.query && req.query.t) || (req.body && req.body.t) || '';

  if (!userId || !token) {
    return res.status(400).json({ error: 'Missing u or t' });
  }

  // Constant-time compare so we don't leak timing info on the token.
  const expected = expectedToken(userId);
  const a = Buffer.from(expected);
  const b = Buffer.from(String(token));
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).json({ error: 'Invalid token' });
  }

  try {
    // Ensure column exists (lazy migration — matches the cron handler).
    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN DEFAULT FALSE`);
    } catch (_) { /* older Postgres — ignore */ }

    const user = await getOne('SELECT id, email FROM users WHERE id = $1', [userId]);
    if (!user) {
      // Don't leak whether the id exists — same 200 either way.
      return res.status(200).json({ success: true, opted_out: true });
    }

    await run('UPDATE users SET email_opted_out = TRUE WHERE id = $1', [userId]);

    // Also mark any still-pending drip rows as sent so we stop trying.
    try {
      await run(
        `UPDATE email_drip_queue
            SET status = 'sent', error = 'opted_out', sent_at = NOW()
          WHERE user_id = $1 AND status = 'pending'`,
        [userId]
      );
    } catch (_) { /* table may not exist on older deploys */ }

    return res.status(200).json({ success: true, opted_out: true });
  } catch (err) {
    console.error('[unsubscribe] Failed:', err);
    return res.status(500).json({ error: 'Failed to unsubscribe' });
  }
};
