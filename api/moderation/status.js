const { authenticate, cors } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

/**
 * GET /api/moderation/status
 * Returns the user's suspension/ban status for the frontend to display.
 * Called on app load to check if the user should see a suspension screen.
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Check if user is suspended or banned
    const fullUser = await getOne(
      `SELECT id, banned, banned_at, ban_reason, ban_type, ban_until,
              suspended_at, suspension_ends_at, suspension_reason,
              violation_count, warning_count
       FROM users WHERE id = $1`,
      [user.id]
    );

    if (!fullUser || !fullUser.banned) {
      return res.status(200).json({ status: 'active' });
    }

    // Check if it's a timed suspension that has expired
    if (fullUser.ban_type === 'suspension' && fullUser.ban_until) {
      const banUntil = new Date(fullUser.ban_until);
      if (banUntil <= new Date()) {
        // Suspension expired — no need to show screen (cron will clean up)
        return res.status(200).json({ status: 'active', note: 'suspension_expired_pending_cron' });
      }
    }

    // Get latest violation for context
    const violation = await getOne(
      `SELECT v.id, v.type, v.status, v.appeal_submitted, v.created_at,
              a.id as appeal_id, a.status as appeal_status
       FROM violations v
       LEFT JOIN appeals a ON a.violation_id = v.id
       WHERE v.accused_user_id = $1 AND v.status IN ('upheld', 'warning_issued')
       ORDER BY v.created_at DESC LIMIT 1`,
      [user.id]
    );

    const isPermanent = fullUser.ban_type === 'permanent' || !fullUser.ban_until;
    const daysRemaining = fullUser.ban_until
      ? Math.max(0, Math.ceil((new Date(fullUser.ban_until).getTime() - Date.now()) / (1000 * 60 * 60 * 24)))
      : null;

    // Check if appeal is still possible (within 7 days of violation, no prior appeal)
    const canAppeal = violation && !violation.appeal_submitted &&
      ((Date.now() - new Date(violation.created_at).getTime()) / (1000 * 60 * 60 * 24)) <= 7;

    return res.status(200).json({
      status: isPermanent ? 'banned' : 'suspended',
      reason: fullUser.ban_reason || fullUser.suspension_reason || 'Violation of community guidelines',
      suspended_at: fullUser.banned_at || fullUser.suspended_at,
      ends_at: fullUser.ban_until || fullUser.suspension_ends_at,
      days_remaining: daysRemaining,
      violation_id: violation?.id || null,
      violation_type: violation?.type || null,
      can_appeal: canAppeal || false,
      appeal_status: violation?.appeal_status || null
    });
  } catch (err) {
    console.error('Moderation status error:', err);
    return res.status(500).json({ error: 'Failed to get status' });
  }
};
