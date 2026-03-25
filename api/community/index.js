const { getMany } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(res);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return cors(res, 401, { error: 'Unauthorized' });
    }

    // Parse query parameters
    const city = req.query.city;
    const category = req.query.category;
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;

    // Validate required city parameter
    if (!city) {
      return cors(res, 400, { error: 'Missing required query parameter: city' });
    }

    // Validate category if provided
    if (category && !['tea-talk', 'good-guys'].includes(category)) {
      return cors(res, 400, { error: 'Invalid category. Must be tea-talk or good-guys' });
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

    return cors(res, 200, {
      posts,
      pagination: {
        page,
        limit,
        total: posts.length < limit ? (page - 1) * limit + posts.length : null
      }
    });
  } catch (error) {
    console.error('Error fetching community posts:', error);
    return cors(res, 500, { error: 'Failed to fetch community posts' });
  }
};
