/**
 * Vercel Cron Job: Send scheduled emails (activation sequence + waitlist nurture)
 *
 * { "path": "/api/cron/send-scheduled-emails", "schedule": "0,15,30,45 * * * *" }
 *
 * Runs every 15 minutes. Picks up rows from scheduled_emails where scheduled_for
 * has passed and the email hasn't been sent yet, then dispatches via the email
 * service. Suppresses an email if the user already completed the milestone the
 * email targets (e.g., skip the "post in your city" email if they've already
 * posted), recording the skip reason on the row.
 */

const { getMany, getOne, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');
const {
  sendActivationDay1Email,
  sendActivationDay3Email,
  sendActivationDay7Email,
  sendActivationDay14Email
} = require('../../services/email');

// Map of email_type → { handler, suppressIf } where suppressIf returns true if we
// should mark the row as skipped instead of sending.
const HANDLERS = {
  activation_day1: {
    send: function (user) { return sendActivationDay1Email(user.email, user.display_name); },
    // No suppression — Name Watch is universal and the email reads as evergreen advice.
    suppressIf: null
  },
  activation_day3: {
    send: function (user) { return sendActivationDay3Email(user.email, user.display_name); },
    // Skip if the user has already posted to the community.
    suppressIf: async function (userId) {
      const row = await getOne(
        `SELECT 1 AS hit FROM posts WHERE user_id = $1 AND COALESCE(hidden, false) = false LIMIT 1`,
        [userId]
      );
      return !!row;
    }
  },
  activation_day7: {
    send: function (user) { return sendActivationDay7Email(user.email, user.display_name); },
    // Skip if the user has already used SafeLink / Check-In. The relevant table may be
    // safelinks or safelink_sessions depending on the build — try both, suppress on hit.
    suppressIf: async function (userId) {
      try {
        const a = await getOne(`SELECT 1 AS hit FROM safelinks WHERE user_id = $1 LIMIT 1`, [userId]);
        if (a) return true;
      } catch (e) { /* table may not exist */ }
      try {
        const b = await getOne(`SELECT 1 AS hit FROM safelink_sessions WHERE user_id = $1 LIMIT 1`, [userId]);
        if (b) return true;
      } catch (e) { /* table may not exist */ }
      return false;
    }
  },
  activation_day14: {
    send: function (user) { return sendActivationDay14Email(user.email, user.display_name); },
    // No suppression — this is the feedback ask. Always relevant.
    suppressIf: null
  }
};

const BATCH_LIMIT = 100;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: Vercel cron header OR bearer token (manual dry-runs)
  const cronHeader = req.headers['x-vercel-cron'];
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const expected = process.env.CRON_SECRET;
  if (!cronHeader && (!expected || providedSecret !== expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    sent: 0,
    skipped: 0,
    failed: 0,
    types: {},
    errors: []
  };

  try {
    const due = await getMany(
      `SELECT s.id, s.user_id, s.email_type, u.email, u.display_name
       FROM scheduled_emails s
       JOIN users u ON u.id = s.user_id
       WHERE s.sent_at IS NULL
         AND s.skipped_reason IS NULL
         AND s.scheduled_for <= NOW()
         AND COALESCE(u.banned, false) = false
         AND u.email IS NOT NULL
       ORDER BY s.scheduled_for ASC
       LIMIT ${BATCH_LIMIT}`
    );

    for (const row of due) {
      const handler = HANDLERS[row.email_type];
      if (!handler) {
        await run(`UPDATE scheduled_emails SET skipped_reason = 'unknown_type' WHERE id = $1`, [row.id]);
        results.skipped++;
        continue;
      }

      // Suppression check (e.g., already posted — skip Day 3)
      if (handler.suppressIf) {
        try {
          const suppress = await handler.suppressIf(row.user_id);
          if (suppress) {
            await run(`UPDATE scheduled_emails SET skipped_reason = 'milestone_completed' WHERE id = $1`, [row.id]);
            results.skipped++;
            results.types[row.email_type] = (results.types[row.email_type] || 0) + 1;
            continue;
          }
        } catch (e) {
          // Don't let suppression errors block delivery — just send.
          console.warn('[ScheduledEmails] Suppression check failed for', row.email_type, ':', e.message);
        }
      }

      try {
        await handler.send({ email: row.email, display_name: row.display_name });
        await run(`UPDATE scheduled_emails SET sent_at = NOW() WHERE id = $1`, [row.id]);
        results.sent++;
        results.types[row.email_type] = (results.types[row.email_type] || 0) + 1;
      } catch (err) {
        results.failed++;
        results.errors.push({ id: row.id, type: row.email_type, error: err.message });
        console.error('[ScheduledEmails] Send failed for row', row.id, err.message);
        // Leave the row as-is; it'll retry on the next run.
      }
    }

    console.log('[ScheduledEmails]', results.sent, 'sent,', results.skipped, 'skipped,', results.failed, 'failed');
    return res.status(200).json(results);
  } catch (err) {
    console.error('[ScheduledEmails] Fatal:', err);
    return res.status(500).json({ error: 'Scheduled email cron failed', details: err.message });
  }
};
