const { getMany } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

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

    // Parse query parameters
    const city = req.query.city;
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Validate required city parameter
    if (!city) {
      return res.status(400).json({ error: 'Missing required query parameter: city' });
    }

    // Validate category if provided
    if (category && !['tea-talk', 'good-guys'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be tea-talk or good-guys' });
    }

    // Build query
    let query = `
      SELECT p.id, p.content, p.photo_id, p.category, p.created_at,
             u.id as user_id, u.username
      FROM posts p
      JOIN users u ON p.user_id = u.id
      WHERE p.city = $1 AND p.is_deleted = false AND p.hidden = false
    `;
    const params = [city];

    // Add category filter if provided
    if (category) {
      query += ' AND p.category = $2';
      params.push(category);
    }

    // Add ordering and pagination
    query += ' ORDER BY p.created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit);
    params.push((page - 1) * limit);

    const posts = await getMany(query, params);

    return res.status(200).json({
      posts,
      pagination: {
        page,
        limit,
        total: posts.length < limit ? (page - 1) * limit + posts.length : null
      }
    });
  } catch (error) {
    console.error('Error fetching community posts:', error);
    return res.status(500).json({ error: 'Failed to fetch community posts' });
  }
};
