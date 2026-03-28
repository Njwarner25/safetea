const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { getPoolHealth, checkScaleThreshold, SCALE_ALERT_THRESHOLD } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Middleware: require admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// GET /api/admin/stats - Main admin dashboard stats
router.get('/stats', authenticate, requireAdmin, async (req, res) => {
  try {
    // Total users
    const totalUsers = await getOne('SELECT COUNT(*) as count FROM users');

    // Users by subscription tier
    const tierBreakdown = await getAll(
      `SELECT subscription_tier, COUNT(*) as count
       FROM users GROUP BY subscription_tier ORDER BY count DESC`
    );

    // New users today
    const newToday = await getOne(
      `SELECT COUNT(*) as count FROM users
       WHERE created_at >= CURRENT_DATE`
    );

    // New users this week
    const newThisWeek = await getOne(
      `SELECT COUNT(*) as count FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'`
    );

    // New users this month
    const newThisMonth = await getOne(
      `SELECT COUNT(*) as count FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'`
    );

    // Users by city (top 15)
    const usersByCity = await getAll(
      `SELECT city, state, COUNT(*) as count
       FROM users WHERE city IS NOT NULL
       GROUP BY city, state ORDER BY count DESC LIMIT 15`
    );

    // Daily signups for the last 30 days
    const dailySignups = await getAll(
      `SELECT DATE(created_at) as date, COUNT(*) as count
       FROM users
       WHERE created_at >= CURRENT_DATE - INTERVAL '30 days'
       GROUP BY DATE(created_at) ORDER BY date DESC`
    );

    // Total posts
    const totalPosts = await getOne('SELECT COUNT(*) as count FROM posts');

    // Total alerts
    const totalAlerts = await getOne('SELECT COUNT(*) as count FROM alerts');

    // Active cities (unlocked)
    const activeCities = await getOne(
      'SELECT COUNT(*) as count FROM city_votes WHERE is_active = true'
    );

    // Total city votes
    const totalCityVotes = await getOne(
      'SELECT SUM(vote_count) as total FROM city_votes'
    );

    // Paid subscribers (SafeTea+ and Pro)
    const paidUsers = await getOne(
      `SELECT COUNT(*) as count FROM users
       WHERE subscription_tier IN ('plus', 'premium')`
    );

    // Name Watch users (Pro)
    const nameWatchUsers = await getOne(
      `SELECT COUNT(DISTINCT user_id) as count FROM watched_names`
    );

    // Scale status
    const scaleCheck = await checkScaleThreshold();

    res.json({
      overview: {
        totalUsers: parseInt(totalUsers.count),
        paidUsers: parseInt(paidUsers.count),
        totalPosts: parseInt(totalPosts.count),
        totalAlerts: parseInt(totalAlerts.count),
        activeCities: parseInt(activeCities.count),
        totalCityVotes: parseInt(totalCityVotes.total) || 0,
        nameWatchUsers: parseInt(nameWatchUsers.count)
      },
      growth: {
        newToday: parseInt(newToday.count),
        newThisWeek: parseInt(newThisWeek.count),
        newThisMonth: parseInt(newThisMonth.count),
        dailySignups
      },
      breakdown: {
        byTier: tierBreakdown,
        byCity: usersByCity
      },
      scaling: {
        threshold: SCALE_ALERT_THRESHOLD,
        currentUsers: scaleCheck ? scaleCheck.userCount : parseInt(totalUsers.count),
        needsUpgrade: scaleCheck ? scaleCheck.needsUpgrade : false,
        poolUtilization: scaleCheck ? Math.round(scaleCheck.poolUtilization * 100) + '%' : 'unknown'
      }
    });
  } catch (err) {
    console.error('Admin stats error:', err);
    res.status(500).json({ error: 'Failed to load admin stats' });
  }
});

// GET /api/admin/metrics - Server health + pool metrics (for monitoring)
router.get('/metrics', authenticate, requireAdmin, async (req, res) => {
  try {
    const poolHealth = getPoolHealth();
    const scaleCheck = await checkScaleThreshold();

    res.json({
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        nodeVersion: process.version
      },
      database: poolHealth,
      scale: scaleCheck
    });
  } catch (err) {
    console.error('Admin metrics error:', err);
    res.status(500).json({ error: 'Failed to load metrics' });
  }
});

// GET /api/admin/users - List all users with pagination
router.get('/users', authenticate, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const search = req.query.search || '';
  const tier = req.query.tier || '';

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (search) {
      whereClause += ` AND (LOWER(email) LIKE LOWER($${paramIndex}) OR LOWER(display_name) LIKE LOWER($${paramIndex}) OR LOWER(city) LIKE LOWER($${paramIndex}))`;
      params.push(`%${search}%`);
      paramIndex++;
    }

    if (tier) {
      whereClause += ` AND subscription_tier = $${paramIndex}`;
      params.push(tier);
      paramIndex++;
    }

    const countResult = await getOne(
      `SELECT COUNT(*) as count FROM users ${whereClause}`,
      params
    );

    const users = await getAll(
      `SELECT id, email, display_name, role, city, state, subscription_tier,
              is_verified, created_at, last_login, avatar_initial, avatar_color
       FROM users ${whereClause}
       ORDER BY created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json({
      users,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.count),
        totalPages: Math.ceil(parseInt(countResult.count) / limit)
      }
    });
  } catch (err) {
    console.error('Admin users list error:', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// GET /api/admin/posts - List all posts with AI analysis data
router.get('/posts', authenticate, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 30, 100);
  const offset = (page - 1) * limit;
  const recommendation = req.query.recommendation || '';
  const minScore = parseInt(req.query.min_score) || 0;
  const maxScore = parseInt(req.query.max_score) || 10;

  try {
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (recommendation) {
      whereClause += ` AND p.ai_recommendation = $${paramIndex}`;
      params.push(recommendation);
      paramIndex++;
    }

    if (minScore > 0) {
      whereClause += ` AND p.ai_credibility_score >= $${paramIndex}`;
      params.push(minScore);
      paramIndex++;
    }

    if (maxScore < 10) {
      whereClause += ` AND p.ai_credibility_score <= $${paramIndex}`;
      params.push(maxScore);
      paramIndex++;
    }

    const countResult = await getOne(
      `SELECT COUNT(*) as count FROM posts p ${whereClause}`,
      params
    );

    const posts = await getAll(
      `SELECT p.*, u.email, u.display_name, u.avatar_initial, u.avatar_color, u.role as user_role
       FROM posts p
       JOIN users u ON p.user_id = u.id
       ${whereClause}
       ORDER BY p.created_at DESC
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json({
      posts,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.count),
        totalPages: Math.ceil(parseInt(countResult.count) / limit)
      }
    });
  } catch (err) {
    console.error('Admin posts list error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// POST /api/admin/posts/bulk-approve - Auto-approve all posts scored 7+
router.post('/posts/bulk-approve', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE posts SET is_flagged = false
       WHERE ai_credibility_score >= 7 AND (is_flagged = true OR is_flagged IS NULL)
       RETURNING id`
    );
    const count = result.rows ? result.rows.length : 0;
    res.json({ message: `${count} posts auto-approved`, count });
  } catch (err) {
    console.error('Bulk approve error:', err);
    res.status(500).json({ error: 'Failed to bulk approve' });
  }
});

// POST /api/admin/posts/bulk-flag - Flag all posts scored 3 or below
router.post('/posts/bulk-flag', authenticate, requireAdmin, async (req, res) => {
  try {
    const result = await query(
      `UPDATE posts SET is_flagged = true
       WHERE ai_credibility_score <= 3 AND ai_credibility_score IS NOT NULL AND is_flagged = false
       RETURNING id`
    );
    const count = result.rows ? result.rows.length : 0;
    res.json({ message: `${count} posts flagged for review`, count });
  } catch (err) {
    console.error('Bulk flag error:', err);
    res.status(500).json({ error: 'Failed to bulk flag' });
  }
});

// PATCH /api/admin/posts/:id/moderate - Individual post moderation
router.patch('/posts/:id/moderate', authenticate, requireAdmin, async (req, res) => {
  const { action } = req.body; // 'approve', 'flag', 'remove'

  if (!['approve', 'flag', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be: approve, flag, or remove' });
  }

  try {
    const post = await getOne('SELECT id FROM posts WHERE id = $1', [req.params.id]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    if (action === 'remove') {
      await query('DELETE FROM posts WHERE id = $1', [req.params.id]);
      res.json({ message: 'Post removed' });
    } else {
      const flagged = action === 'flag';
      await query('UPDATE posts SET is_flagged = $1 WHERE id = $2', [flagged, req.params.id]);
      res.json({ message: `Post ${action === 'approve' ? 'approved' : 'flagged'}` });
    }
  } catch (err) {
    console.error('Moderate post error:', err);
    res.status(500).json({ error: 'Failed to moderate post' });
  }
});

module.exports = router;
