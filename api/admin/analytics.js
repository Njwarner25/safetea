const { requireAdmin } = require('../_utils/adminAuth');
const { cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // User stats by tier
    const usersByTier = await getMany(
      `SELECT COALESCE(subscription_tier, 'free') as tier, COUNT(*) as count
       FROM users GROUP BY subscription_tier`
    );

    const totalUsers = await getOne('SELECT COUNT(*) as total FROM users');

    // New signups
    const signups7d = await getOne(
      "SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '7 days'"
    );
    const signups30d = await getOne(
      "SELECT COUNT(*) as count FROM users WHERE created_at >= NOW() - INTERVAL '30 days'"
    );

    // Active users (based on last_active)
    const dau = await getOne(
      "SELECT COUNT(*) as count FROM users WHERE last_active >= NOW() - INTERVAL '1 day'"
    );
    const mau = await getOne(
      "SELECT COUNT(*) as count FROM users WHERE last_active >= NOW() - INTERVAL '30 days'"
    );

    // Posts per day (last 30 days)
    const postsPerDay = await getMany(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM posts
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    // Reports per day (last 30 days)
    const reportsPerDay = await getMany(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM reports
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    // Users by role
    const usersByRole = await getMany(
      `SELECT role, COUNT(*) as count FROM users GROUP BY role`
    );

    // Recent signups trend (daily for last 30 days)
    const signupTrend = await getMany(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users
       WHERE created_at >= NOW() - INTERVAL '30 days'
       GROUP BY DATE(created_at)
       ORDER BY date DESC`
    );

    // Moderation stats
    const pendingReports = await getOne(
      "SELECT COUNT(*) as count FROM reports WHERE status = 'pending'"
    );
    const flaggedPosts = await getOne(
      "SELECT COUNT(*) as count FROM posts WHERE moderation_status = 'flagged'"
    );
    const bannedUsers = await getOne(
      'SELECT COUNT(*) as count FROM users WHERE banned = true'
    );

    return res.status(200).json({
      overview: {
        total_users: parseInt(totalUsers.total),
        signups_7d: parseInt(signups7d.count),
        signups_30d: parseInt(signups30d.count),
        dau: parseInt(dau.count),
        mau: parseInt(mau.count),
        pending_reports: parseInt(pendingReports.count),
        flagged_posts: parseInt(flaggedPosts.count),
        banned_users: parseInt(bannedUsers.count)
      },
      users_by_tier: usersByTier,
      users_by_role: usersByRole,
      posts_per_day: postsPerDay,
      reports_per_day: reportsPerDay,
      signup_trend: signupTrend
    });
  } catch (err) {
    console.error('Admin analytics error:', err);
    return res.status(500).json({ error: 'Failed to fetch analytics' });
  }
};
