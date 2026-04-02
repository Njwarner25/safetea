const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const totalUsers = await getOne('SELECT COUNT(*) as count FROM users');

    const tierBreakdown = await getMany(
      `SELECT subscription_tier, COUNT(*) as count
       FROM users GROUP BY subscription_tier ORDER BY count DESC`
    );

    const newToday = await getOne(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE`
    );

    const newThisWeek = await getOne(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
    );

    const newThisMonth = await getOne(
      `SELECT COUNT(*) as count FROM users WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
    );

    const usersByCity = await getMany(
      `SELECT city, COUNT(*) as count
       FROM users WHERE city IS NOT NULL
       GROUP BY city ORDER BY count DESC LIMIT 15`
    );

    const dailySignups = await getMany(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date DESC`
    );

    const totalPosts = await getOne('SELECT COUNT(*) as count FROM posts');
    const totalAlerts = await getOne('SELECT COUNT(*) as count FROM alerts');

    let activeCities;
    try {
      activeCities = await getOne('SELECT COUNT(*) as count FROM city_votes WHERE is_active = true');
    } catch (e) {
      activeCities = await getOne('SELECT COUNT(*) as count FROM city_votes');
    }

    const totalCityVotes = await getOne('SELECT SUM(votes) as total FROM city_votes');

    const paidUsers = await getOne(
      `SELECT COUNT(*) as count FROM users WHERE subscription_tier IN ('plus', 'pro', 'premium')`
    );

    let nameWatchUsers = { count: 0 };
    try {
      nameWatchUsers = await getOne('SELECT COUNT(DISTINCT user_id) as count FROM watched_names');
    } catch (e) {}

    // Trust score distribution
    let trustDistribution = { low: 0, medium: 0, high: 0, avg: 0 };
    try {
      const lowTrust = await getOne('SELECT COUNT(*) as count FROM users WHERE trust_score <= 30 AND banned IS NOT TRUE');
      const medTrust = await getOne('SELECT COUNT(*) as count FROM users WHERE trust_score > 30 AND trust_score < 70 AND banned IS NOT TRUE');
      const highTrust = await getOne('SELECT COUNT(*) as count FROM users WHERE trust_score >= 70 AND banned IS NOT TRUE');
      const avgTrust = await getOne('SELECT ROUND(AVG(trust_score)) as avg FROM users WHERE banned IS NOT TRUE');
      trustDistribution = {
        low: parseInt(lowTrust.count) || 0,
        medium: parseInt(medTrust.count) || 0,
        high: parseInt(highTrust.count) || 0,
        avg: parseInt(avgTrust.avg) || 0
      };
    } catch (e) {}

    return res.json({
      overview: {
        totalUsers: parseInt(totalUsers.count) || 0,
        paidUsers: parseInt(paidUsers.count) || 0,
        totalPosts: parseInt(totalPosts.count) || 0,
        totalAlerts: parseInt(totalAlerts?.count) || 0,
        activeCities: parseInt(activeCities?.count) || 0,
        totalCityVotes: parseInt(totalCityVotes?.total) || 0,
        nameWatchUsers: parseInt(nameWatchUsers?.count) || 0
      },
      growth: {
        newToday: parseInt(newToday.count) || 0,
        newThisWeek: parseInt(newThisWeek.count) || 0,
        newThisMonth: parseInt(newThisMonth.count) || 0,
        dailySignups
      },
      breakdown: {
        byTier: tierBreakdown,
        byCity: usersByCity
      },
      trustScore: trustDistribution
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    return res.status(500).json({ error: 'Failed to load admin stats' });
  }
};
