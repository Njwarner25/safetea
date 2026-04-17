/**
 * Vercel Cron Job: Lift expired suspensions
 *
 * { "path": "/api/cron/lift-suspensions", "schedule": "0 1 * * *" }
 *
 * Runs daily at 1 AM UTC.
 * Finds users with timed suspensions that have expired and reinstates them.
 */

const { getMany, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');
const { sendEmail, wrapHtml } = require('../../services/email');

async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { timestamp: new Date().toISOString(), suspensions_lifted: 0, errors: [] };

  try {
    // Find users whose suspension has expired (ban_type = 'suspension' and ban_until < now)
    const expiredSuspensions = await getMany(
      `SELECT id, email, display_name, ban_until
       FROM users
       WHERE banned = true
       AND ban_type = 'suspension'
       AND ban_until IS NOT NULL
       AND ban_until <= NOW()`
    );

    for (const user of expiredSuspensions) {
      try {
        await run(
          `UPDATE users SET
            banned = false, banned_at = NULL, ban_reason = NULL, ban_type = NULL, ban_until = NULL,
            suspended_at = NULL, suspension_ends_at = NULL, suspension_reason = NULL
           WHERE id = $1`,
          [user.id]
        );

        // Unhide their posts
        await run('UPDATE posts SET hidden = false WHERE user_id = $1 AND hidden = true', [user.id]).catch(() => {});

        // Send reinstatement email
        await sendEmail({
          to: user.email,
          subject: 'Your SafeTea Account Has Been Reinstated',
          html: wrapHtml(`
            <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Welcome Back</h2>
            <p>Hey ${user.display_name || 'there'}, your 30-day suspension has ended and your SafeTea account has been reinstated.</p>
            <p>Please review our <a href="https://getsafetea.app/terms.html" style="color:#E8A0B5;">community guidelines</a> to avoid future violations.</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="https://getsafetea.app/login.html" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;">Return to SafeTea</a>
            </div>
          `)
        }).catch(() => {});

        results.suspensions_lifted++;
        console.log(`lift-suspensions: Reinstated user ${user.id} (${user.email})`);
      } catch (userErr) {
        results.errors.push({ user_id: user.id, error: userErr.message });
      }
    }

    console.log('lift-suspensions: Complete.', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('lift-suspensions: Fatal error:', err);
    return res.status(500).json({ error: 'Cron job failed', message: err.message });
  }
};

module.exports = require('../_utils/cron-wrapper').withCronLogging('lift-suspensions', handler);
