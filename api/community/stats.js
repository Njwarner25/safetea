const { getOne } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  cors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate required city parameter
    const city = req.query.city;
    if (!city) {
      return res.status(400).json({ error: 'Missing required query parameter: city' });
    }

    // Get city stats
    const stats = await getOne(
      `SELECT
        (SELECT COUNT(*) FROM posts WHERE city = $1 AND is_deleted = false AND hidden = false) as post_count,
        (SELECT COUNT(DISTINCT user_id) FROM users WHERE city = $1) as user_count,
        (SELECT COUNT(*) FROM posts WHERE city = $1 AND category = 'tea-talk' AND is_deleted = false AND hidden = false) as tea_talk_count,
        (SELECT COUNT(*) FROM posts WHERE city = $1 AND category = 'good-guys' AND is_deleted = false AND hidden = false) as good_guys_count,
        (SELECT MAX(created_at) FROM posts WHERE city = $1 AND is_deleted = false AND hidden = false) as latest_post_date`,
      [city]
    );

    return res.status(200).json({
      post_count: parseInt(stats.post_count),
      user_count: parseInt(stats.user_count),
      tea_talk_count: parseInt(stats.tea_talk_count),
      good_guys_count: parseInt(stats.good_guys_count),
      latest_post_date: stats.latest_post_date
    });
  } catch (error) {
    console.error('Error fetching community stats:', error);
    return res.status(500).json({ error: 'Failed to fetch community stats' });
  }
};
