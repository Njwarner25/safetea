/**
 * POST /api/account/delete
 *
 * Self-serve account deletion (CCPA / GDPR / Apple 5.1.1(v) / Google Play data
 * safety). Schedules a soft-deletion 30 days out — the actual purge happens in
 * /api/cron/process-deletions. This gives the user a window to undo (via the
 * link mailed below) and gives the operator an audit trail.
 *
 * Body: { confirmation: 'DELETE' }   (literal "DELETE" required — guards UI
 * accidents like double-tap. We don't accept yes/true/etc.)
 *
 * Side effects (all immediate):
 *   - users.deletion_scheduled_at = NOW() + 30 days
 *   - users.email_opted_out = TRUE  (halts drip emails during grace period)
 *   - Stripe subscription canceled if one is on file — operator should not
 *     be billed during the grace period.
 *   - Sends confirmation email with a /api/account/restore?token=… link.
 *
 * Returns: { scheduled_for, undo_token }
 */

const crypto = require('crypto');
const { authenticate, cors, parseBody, JWT_SECRET } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { sendEmail, wrapHtml } = require('../../services/email');

let stripeClient = null;
try {
  stripeClient = require('../_utils/stripe').stripe;
} catch (_) { /* stripe util optional in dev */ }

const GRACE_DAYS = 30;
const SITE_BASE = (process.env.PUBLIC_APP_URL || 'https://www.getsafetea.app').replace(/\/$/, '');

// Lazy schema bump — single ADD COLUMN IF NOT EXISTS, idempotent.
async function ensureSchema() {
  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS deletion_scheduled_at TIMESTAMPTZ`);
  } catch (_) { /* older Postgres without IF NOT EXISTS — ignore */ }
  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS email_opted_out BOOLEAN DEFAULT FALSE`);
  } catch (_) {}
  try {
    await run(`CREATE INDEX IF NOT EXISTS idx_users_deletion_scheduled
               ON users (deletion_scheduled_at)
               WHERE deletion_scheduled_at IS NOT NULL`);
  } catch (_) {}
}

// HMAC-SHA256 of `delete-undo:<userId>` keyed with JWT_SECRET. The restore
// endpoint recomputes and compares — no DB lookup needed.
function makeUndoToken(userId) {
  const secret = JWT_SECRET || process.env.JWT_SECRET || 'safetea-undo-fallback';
  return crypto
    .createHmac('sha256', secret)
    .update('delete-undo:' + String(userId))
    .digest('hex');
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  // Operator must literally type DELETE — protects against an accidental
  // tap on a button + browser autofill / iOS WebView quirks.
  if (!body || body.confirmation !== 'DELETE') {
    return res.status(400).json({
      error: 'Confirmation required',
      message: 'Type DELETE to confirm account deletion.',
    });
  }

  try {
    await ensureSchema();

    const scheduledFor = new Date(Date.now() + GRACE_DAYS * 24 * 3600 * 1000);

    // Schedule the deletion. We always overwrite — a user who hits the
    // button a second time should reset their 30-day window, not stack
    // additional grace periods on top.
    await run(
      `UPDATE users
       SET deletion_scheduled_at = $1,
           email_opted_out = TRUE
       WHERE id = $2`,
      [scheduledFor.toISOString(), user.id]
    );

    // Cancel any active Stripe subscription so the user isn't billed
    // during the 30-day grace window. We don't gate on success — if Stripe
    // is mis-configured we still want the deletion scheduled. The webhook
    // will reconcile the row state independently.
    let stripeCanceled = false;
    if (user.stripe_subscription_id && stripeClient) {
      try {
        await stripeClient.subscriptions.cancel(user.stripe_subscription_id);
        stripeCanceled = true;
      } catch (err) {
        // Common case: subscription already canceled. Log and move on —
        // never block deletion on Stripe.
        console.warn(
          '[account/delete] Stripe cancel failed for user',
          user.id,
          err && err.message ? err.message : err
        );
      }
    }

    const undoToken = makeUndoToken(user.id);
    const restoreUrl =
      SITE_BASE +
      '/api/account/restore?token=' +
      encodeURIComponent(undoToken) +
      '&u=' +
      encodeURIComponent(String(user.id));

    // Confirmation email. Brand-neutral copy in the body so the iOS
    // rebrand JS doesn't have to swap strings; the wrapHtml chrome still
    // shows "SafeTea" but that's a separate visual rebrand workstream.
    const niceDate = scheduledFor.toUTCString().replace(' GMT', ' UTC');
    if (user.email) {
      try {
        await sendEmail({
          to: user.email,
          subject: 'Your account deletion is scheduled',
          html: wrapHtml(`
            <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Your account is scheduled for deletion</h2>
            <p>We've received your request to delete your account. Nothing has been deleted yet — your data will be permanently removed on:</p>
            <p style="background:#1A1A2E;border-left:3px solid #E8A0B5;padding:14px 18px;border-radius:8px;margin:18px 0;color:#fff;font-weight:600;">
              ${niceDate}
            </p>
            <p>If you change your mind, you can restore your account at any time during the next ${GRACE_DAYS} days:</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="${restoreUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Restore my account</a>
            </div>
            <p style="color:#8080A0;font-size:13px;line-height:1.5;">
              We've also canceled your subscription (if any), so you won't be billed during the grace period.
              If you didn't request this, click the button above immediately and contact
              <a href="mailto:support@getsafetea.app" style="color:#E8A0B5;">support</a>.
            </p>
            <p style="color:#666;font-size:11px;margin-top:18px;">If the button doesn't open, paste this URL into your browser:<br><span style="word-break:break-all;color:#888;">${restoreUrl}</span></p>
          `),
          text:
            'Your account is scheduled for deletion on ' + niceDate + '.\n\n' +
            'Restore it any time in the next ' + GRACE_DAYS + ' days:\n' + restoreUrl + '\n\n' +
            'If you didn\'t request this, restore the account and contact support@getsafetea.app.',
        });
      } catch (err) {
        // Email failure is non-fatal — the deletion is still scheduled
        // and the user has the in-app confirmation toast.
        console.error('[account/delete] confirmation email failed:', err && err.message);
      }
    }

    return res.status(200).json({
      ok: true,
      scheduled_for: scheduledFor.toISOString(),
      undo_token: undoToken,
      stripe_subscription_canceled: stripeCanceled,
      grace_period_days: GRACE_DAYS,
    });
  } catch (err) {
    console.error('[account/delete] error:', err && err.message);
    return res.status(500).json({ error: 'Failed to schedule deletion' });
  }
};
