/**
 * Vercel Cron: Welcome email drip sequence
 *
 * Runs every 30 minutes. Pulls every row from `email_drip_queue` where
 * `send_at <= NOW()` and `status = 'pending'`, sends the corresponding
 * template via SendGrid, and marks the row `sent` (or `failed` with an
 * error column).
 *
 * Schedule entry lives in vercel.json:
 *   { "path": "/api/cron/email-drip", "schedule": "*\/30 * * * *" }
 *
 * Templates fired (relative to signup):
 *   day 0 — welcome_tour      ("Welcome — your SafeTea+ tour starts here")
 *   day 2 — social_proof      ("How Sarah used SafeTea on her date last week")
 *   day 5 — conversion_offer  ("Last chance: 50% off your first month")
 *
 * Idempotent — we filter on status = 'pending', so a row that's already
 * 'sent' or 'failed' is skipped on the next tick. To enqueue, see
 * api/auth/register.js (best-effort, non-blocking).
 */

const { getMany, getOne, run } = require('../_utils/db');
const { sendEmail, wrapHtml } = require('../../services/email');

const SITE_BASE = 'https://www.getsafetea.app';
const COUPON_CODE = 'WELCOME50';

// ─── Schema bootstrap (lazy CREATE TABLE IF NOT EXISTS) ───
async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS email_drip_queue (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    template VARCHAR(64) NOT NULL,
    send_at TIMESTAMPTZ NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'pending',
    error TEXT,
    sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_email_drip_queue_due
             ON email_drip_queue (status, send_at)`);
  // Idempotency belt-and-suspenders: never enqueue the same template
  // twice for the same user. The enqueue site uses ON CONFLICT DO
  // NOTHING against this constraint.
  await run(`CREATE UNIQUE INDEX IF NOT EXISTS idx_email_drip_queue_user_template
             ON email_drip_queue (user_id, template)`);
  // Unsubscribe flag. Lazy-added so we don't need a migration file.
  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN DEFAULT FALSE`);
  } catch (_) { /* older Postgres without IF NOT EXISTS — ignore */ }
}

// ─── Unsubscribe link helper ───
// We use the user's id + a HMAC-ish lightweight token so a leaked email
// can't be used to unsub someone else. Stays in sync with the public
// unsubscribe page at /unsubscribe.html.
const crypto = require('crypto');
function unsubToken(userId) {
  const secret = process.env.JWT_SECRET || 'safetea-unsub-fallback';
  return crypto.createHmac('sha256', secret).update('unsub:' + userId).digest('hex').slice(0, 24);
}
function unsubscribeUrl(userId) {
  return `${SITE_BASE}/unsubscribe.html?u=${userId}&t=${unsubToken(userId)}`;
}

// ─── Email templates ───
// Inline HTML, brand-neutral copy ("the app", "your subscription") so
// the iOS rebrand JS can swap SafeTea → LinkHer without touching the
// server. The visual chrome from wrapHtml() still shows the SafeTea
// wordmark — that's intentional for now; trademark/visual rebrand is
// a separate workstream.

function footerHtml(userId) {
  return `
    <hr style="border:none;border-top:1px solid rgba(255,255,255,0.08);margin:28px 0 16px;">
    <p style="color:#8080A0;font-size:12px;line-height:1.5;margin:0;">
      You're getting this because you signed up for the app.
      <a href="${unsubscribeUrl(userId)}" style="color:#E8A0B5;">Unsubscribe</a> any time.
    </p>
  `;
}

function templateDay0({ displayName, userId }) {
  const name = (displayName || 'there').replace(/[<>&]/g, '');
  return {
    subject: 'Welcome — your SafeTea+ tour starts here',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome, ${name}.</h2>
      <p>You don't need a pitch. You need to know what's in the toolbox. Here's the short version — three tools, one paragraph each, and a button to log in when you're ready.</p>

      <div style="background:rgba(232,160,181,0.08);border:1px solid rgba(232,160,181,0.15);border-radius:12px;padding:18px;margin:18px 0;">
        <h3 style="color:#E8A0B5;font-size:15px;margin:0 0 8px;">SafeLink</h3>
        <p style="margin:0;">Share a live link with someone you trust before you head out. They see where you are, how long you've been there, and a one-tap way to reach you. No app install required on their side.</p>
      </div>

      <div style="background:rgba(91,160,208,0.08);border:1px solid rgba(91,160,208,0.15);border-radius:12px;padding:18px;margin:18px 0;">
        <h3 style="color:#5BA0D0;font-size:15px;margin:0 0 8px;">Pulse</h3>
        <p style="margin:0;">A quiet background check on the date itself. If something feels off — stalled location, missed check-in, weird patterns — Pulse flags it before it becomes a story you tell later.</p>
      </div>

      <div style="background:rgba(180,140,210,0.08);border:1px solid rgba(180,140,210,0.15);border-radius:12px;padding:18px;margin:18px 0;">
        <h3 style="color:#B48CD2;font-size:15px;margin:0 0 8px;">Alessia</h3>
        <p style="margin:0;">Your AI safety companion. She writes you a brief on the person you're meeting, helps you think through a plan, and stays available the whole night. She believes you, doesn't lecture, doesn't push.</p>
      </div>

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${SITE_BASE}/login.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Log in</a>
      </div>

      <p style="color:#8080A0;font-size:13px;">We'll send a couple more notes over the next week. Take what's useful, ignore the rest.</p>
      ${footerHtml(userId)}
    `)
  };
}

function templateDay2({ displayName, userId }) {
  const name = (displayName || 'there').replace(/[<>&]/g, '');
  return {
    subject: 'How Sarah used SafeTea on her date last week',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">A short story, ${name}.</h2>
      <p>Sarah — composite, not a real person, but every beat below is something the app actually does — matched with someone on a Tuesday. Coffee, Thursday at 7. Public spot. Photo looked fine. She still wanted a quiet net under her, just in case.</p>

      <p><strong style="color:#E8A0B5;">Thursday, 6:42pm.</strong> She sent a SafeLink to her sister. Just a tap. Her sister got a text with a live map and a one-line note: <em>"Coffee with Daniel, 7pm at Reverie, back by 9."</em> No app install needed.</p>

      <p><strong style="color:#5BA0D0;">7:00pm.</strong> She tapped Date Check-in. The app started a quiet timer — nothing visible to the date, nothing buzzing in her bag. If she didn't check back in by 9:15, her sister would get an automatic nudge to call.</p>

      <p><strong style="color:#B48CD2;">7:14pm.</strong> Date asked a question that felt off. She slipped into the bathroom, opened Alessia, asked: <em>"He's pressing on why I moved. Is that normal first-date stuff?"</em> Alessia gave her a quick brief — context from his public profile, a couple of grounded ways to deflect, and a reminder that she was allowed to leave at any time. No drama. Just a second brain.</p>

      <p><strong>9:08pm.</strong> She checked in. Sister got a confirmation text. Date was fine, actually. Daniel got a second one.</p>

      <p>Nothing went wrong. Most nights nothing goes wrong. The whole point is that the net is already up when something does.</p>

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${SITE_BASE}/subscribe.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Try it free for 7 days</a>
      </div>

      <p style="color:#8080A0;font-size:13px;">No charge until day 8. Cancel any time from your settings.</p>
      ${footerHtml(userId)}
    `)
  };
}

function templateDay5({ displayName, userId }) {
  const name = (displayName || 'there').replace(/[<>&]/g, '');
  return {
    subject: 'Last chance: 50% off your first month',
    html: wrapHtml(`
      <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">One last note, ${name}.</h2>
      <p>If the app's not for you, no hard feelings — you can ignore this and we'll stop. But if you've been waiting for a reason to actually turn the paid tier on, here it is: half off your first month, no strings.</p>

      <div style="background:rgba(232,160,181,0.10);border:1px dashed rgba(232,160,181,0.35);border-radius:12px;padding:20px;margin:20px 0;text-align:center;">
        <p style="color:#8080A0;font-size:12px;letter-spacing:1px;text-transform:uppercase;margin:0 0 6px;">Your code</p>
        <p style="color:#E8A0B5;font-size:28px;font-weight:800;letter-spacing:3px;margin:0;font-family:'Courier New',Courier,monospace;">${COUPON_CODE}</p>
        <p style="color:#8080A0;font-size:12px;margin:8px 0 0;">50% off your first month. Applies at checkout.</p>
      </div>

      <p>What you get for the month:</p>
      <ul style="padding-left:20px;margin:12px 0;color:#F0D0C0;">
        <li>Unlimited SafeLink shares with live tracking</li>
        <li>Pulse anomaly detection on every date</li>
        <li>Full access to Alessia, your safety companion</li>
        <li>SOS recording and trusted-contact alerts</li>
      </ul>

      <div style="text-align:center;margin:24px 0 8px;">
        <a href="${SITE_BASE}/subscribe.html?code=${COUPON_CODE}" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Subscribe with ${COUPON_CODE}</a>
      </div>

      <p style="color:#8080A0;font-size:13px;">This is the last automated note from us. Whatever you decide, take care out there.</p>
      ${footerHtml(userId)}
    `)
  };
}

const TEMPLATES = {
  welcome_tour: templateDay0,
  social_proof: templateDay2,
  conversion_offer: templateDay5,
};

// ─── Handler ───
module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Standard cron-secret check (matches expire-referrals.js)
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('[email-drip] CRITICAL: CRON_SECRET not set');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (providedSecret !== cronSecret) {
    console.warn('[email-drip] Unauthorized cron request');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    due: 0,
    sent: 0,
    failed: 0,
    skipped_opted_out: 0,
    skipped_no_user: 0,
    errors: [],
  };

  try {
    await ensureSchema();

    // Pull due rows. Cap at 200/tick — Vercel cron has a hard timeout
    // and SendGrid will rate-limit anyway. If the backlog ever exceeds
    // 200, the next 30-min tick picks up the rest.
    const due = await getMany(
      `SELECT id, user_id, template
         FROM email_drip_queue
        WHERE status = 'pending'
          AND send_at <= NOW()
        ORDER BY send_at ASC
        LIMIT 200`
    );
    results.due = due.length;

    for (const row of due) {
      try {
        const user = await getOne(
          'SELECT id, email, display_name, email_opted_out FROM users WHERE id = $1',
          [row.user_id]
        );

        if (!user || !user.email) {
          await run(
            `UPDATE email_drip_queue SET status = 'failed', error = $2, sent_at = NOW() WHERE id = $1`,
            [row.id, 'user_not_found']
          );
          results.skipped_no_user++;
          continue;
        }

        if (user.email_opted_out) {
          // Treat opted-out as 'sent' — we don't want to keep retrying
          // forever, and we don't want a future re-opt to suddenly
          // dump a stale 5-day-old "last chance" email on them.
          await run(
            `UPDATE email_drip_queue SET status = 'sent', error = $2, sent_at = NOW() WHERE id = $1`,
            [row.id, 'opted_out']
          );
          results.skipped_opted_out++;
          continue;
        }

        const templateFn = TEMPLATES[row.template];
        if (!templateFn) {
          await run(
            `UPDATE email_drip_queue SET status = 'failed', error = $2, sent_at = NOW() WHERE id = $1`,
            [row.id, 'unknown_template:' + row.template]
          );
          results.failed++;
          continue;
        }

        const { subject, html } = templateFn({
          displayName: user.display_name,
          userId: user.id,
        });

        const sendResult = await sendEmail({
          to: user.email,
          subject,
          html,
        });

        if (sendResult.success) {
          await run(
            `UPDATE email_drip_queue SET status = 'sent', sent_at = NOW() WHERE id = $1`,
            [row.id]
          );
          results.sent++;
        } else {
          await run(
            `UPDATE email_drip_queue SET status = 'failed', error = $2, sent_at = NOW() WHERE id = $1`,
            [row.id, String(sendResult.reason || 'unknown').slice(0, 500)]
          );
          results.failed++;
          results.errors.push({ id: row.id, reason: sendResult.reason });
        }
      } catch (rowErr) {
        console.error(`[email-drip] Row ${row.id} failed:`, rowErr.message);
        try {
          await run(
            `UPDATE email_drip_queue SET status = 'failed', error = $2, sent_at = NOW() WHERE id = $1`,
            [row.id, String(rowErr.message || rowErr).slice(0, 500)]
          );
        } catch (_) { /* swallow */ }
        results.failed++;
        results.errors.push({ id: row.id, reason: rowErr.message });
      }
    }

    console.log('[email-drip] Complete.', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('[email-drip] Fatal:', err);
    return res.status(500).json({
      error: 'Cron failed',
      message: err.message,
      partial: results,
    });
  }
};

// Exported for the enqueue site (api/auth/register.js) so it can reuse
// the same schema bootstrap before its INSERT.
module.exports.ensureSchema = ensureSchema;
