const { run, getOne } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(res);
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return cors(res, 401, { error: 'Unauthorized' });
    }

    // Parse request body
    const body = await parseBody(req);
    const { content, category, photo_id } = body;

    // Validate category
    if (!category || !['tea-talk', 'good-guys'].includes(category)) {
      return cors(res, 400, { error: 'Invalid category. Must be tea-talk or good-guys' });
    }

    // Validate content length
    if (!content || typeof content !== 'string' || content.length < 1 || content.length > 2000) {
      return cors(res, 400, { error: 'Content must be between 1 and 2000 characters' });
    }

    // Check if user has a city set
    if (!user.city) {
      return cors(res, 400, { error: 'Please select a city first' });
    }

    // Create the post
    const result = await run(
      `INSERT INTO posts (user_id, content, category, city, photo_id, is_deleted, hidden, created_at)
       VALUES ($1, $2, $3, $4, $5, false, false, NOW())
       RETURNING id, user_id, content, category, city, photo_id, created_at`,
      [user.id, content, category, user.city, photo_id || null]
    );

    const post = result.rows[0];

    return cors(res, 201, {
      id: post.id,
      user_id: post.user_id,
      content: post.content,
      category: post.category,
      city: post.city,
      photo_id: post.photo_id,
      created_at: post.created_at
    });
  } catch (error) {
    console.error('Error creating post:', error);
    return cors(res, 500, { error: 'Failed to create post' });
  }
};
