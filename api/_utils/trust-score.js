const { getOne, getMany, run } = require('./db');

/**
 * Trust Score V2 Calculation Engine
 *
 * Point table:
 *   Didit ID verification         +30
 *   Selfie + Liveness (combined)  +60  (30+30, one step)
 *   Phone verified                +10
 *   Social media (each, max 3)    +20  (must be legit profiles)
 *
 * Penalties:
 *   Unresolved reports (each)     -5   (cap -25)
 *   Flagged by system             -10
 *   Gender reports >= 3           -15
 *   Banned                        score = 0
 *
 * City chat requires score >= 70
 * Admin re-verification triggered at score <= 30
 */

async function recalculateTrustScore(userId, eventType, triggeredBy, adminId) {
  // Fetch user data
  const user = await getOne(
    `SELECT id, didit_verified, identity_verified, phone_verified,
            banned, gender_report_count, flagged
     FROM users WHERE id = $1`,
    [userId]
  );

  if (!user) return null;

  // Get old score
  const oldScore = await getOne('SELECT trust_score FROM users WHERE id = $1', [userId]);
  const scoreBefore = (oldScore && oldScore.trust_score) || 0;

  // Banned = 0, no calculation needed
  if (user.banned) {
    await run('UPDATE users SET trust_score = 0, trust_score_updated_at = NOW() WHERE id = $1', [userId]);
    await logTrustEvent(userId, eventType || 'banned', scoreBefore, 0, 'User is banned — score set to 0', triggeredBy, adminId);
    return 0;
  }

  let score = 0;

  // ── Verification signals (V2) ──
  if (user.didit_verified) score += 30;
  if (user.identity_verified) score += 60;  // selfie + liveness combined
  if (user.phone_verified) score += 10;

  // Connected social media: 20 per verified legit profile, max 3
  try {
    const socialCount = await getOne(
      `SELECT COUNT(*) as count FROM connected_accounts
       WHERE user_id = $1 AND verified = true AND flagged = false`,
      [userId]
    );
    const socials = Math.min(parseInt(socialCount.count) || 0, 3);
    score += socials * 20;
  } catch (e) { /* connected_accounts table may not exist yet */ }

  // ── Penalties (unchanged) ──

  // Unresolved reports: -5 each, cap at -25
  try {
    const reportCount = await getOne(
      `SELECT COUNT(*) as count FROM post_reports WHERE reported_user_id = $1 AND status != 'resolved'`,
      [userId]
    );
    const reports = Math.min(parseInt(reportCount.count) || 0, 5);
    score -= reports * 5;
  } catch (e) {
    try {
      const reportCount = await getOne(
        `SELECT COUNT(*) as count FROM post_reports WHERE user_id = $1 AND status != 'resolved'`,
        [userId]
      );
      const reports = Math.min(parseInt(reportCount.count) || 0, 5);
      score -= reports * 5;
    } catch (e2) { /* table may not exist */ }
  }

  // Flagged by system
  if (user.flagged) score -= 10;

  // Gender reports >= 3
  if ((user.gender_report_count || 0) >= 3) score -= 15;

  // Clamp to 0-100
  score = Math.max(0, Math.min(100, score));

  // Persist
  await run(
    'UPDATE users SET trust_score = $1, trust_score_updated_at = NOW() WHERE id = $2',
    [score, userId]
  );

  // Log event
  await logTrustEvent(userId, eventType || 'recalc', scoreBefore, score,
    'Score recalculated: ' + scoreBefore + ' -> ' + score, triggeredBy, adminId);

  // Auto-trigger re-verification if score drops to 30 or below
  if (score <= 30 && scoreBefore > 30) {
    try {
      const existing = await getOne(
        `SELECT id FROM verification_requests WHERE user_id = $1 AND status = 'pending'`,
        [userId]
      );
      if (!existing) {
        await run(
          `INSERT INTO verification_requests (user_id, requested_by, reason, status)
           VALUES ($1, NULL, $2, 'pending')`,
          [userId, 'Trust score dropped to ' + score + ' (auto-triggered at <= 30)']
        );
        await run(
          `UPDATE users SET verification_status = 'reverification_required' WHERE id = $1`,
          [userId]
        );
        await logTrustEvent(userId, 'reverification_auto', scoreBefore, score,
          'Auto re-verification triggered: score dropped to ' + score, 'system', null);
      }
    } catch (e) {
      console.error('[TrustScore] Failed to trigger re-verification:', e.message);
    }
  }

  return score;
}

async function logTrustEvent(userId, eventType, scoreBefore, scoreAfter, reason, triggeredBy, adminId) {
  try {
    await run(
      `INSERT INTO trust_events (user_id, event_type, delta, score_before, score_after, reason, triggered_by, admin_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        userId,
        eventType,
        scoreAfter - scoreBefore,
        scoreBefore,
        scoreAfter,
        reason,
        triggeredBy || 'system',
        adminId || null
      ]
    );
  } catch (e) {
    console.error('[TrustScore] Failed to log event:', e.message);
  }
}

module.exports = { recalculateTrustScore, logTrustEvent };
