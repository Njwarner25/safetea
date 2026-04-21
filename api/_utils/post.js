const { run, getOne } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { checkNewPostAgainstWatchedNames } = require('../_utils/namewatch');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  cors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse request body
    const body = await parseBody(req);
    const { content, category, photo_id } = body;

    // Validate category — Good Guys removed 2026-04; safety-only categories going forward
    if (!category || !['tea-talk'].includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be tea-talk' });
    }

    // Validate content length
    if (!content || typeof content !== 'string' || content.length < 1 || content.length > 2000) {
      return res.status(400).json({ error: 'Content must be between 1 and 2000 characters' });
    }

    // Check if user has a city set
    if (!user.city) {
      return res.status(400).json({ error: 'Please select a city first' });
    }

    // Create the post
    const result = await run(
      `INSERT INTO posts (user_id, content, category, city, photo_id, is_deleted, hidden, created_at)
       VALUES ($1, $2, $3, $4, $5, false, false, NOW())
       RETURNING id, user_id, content, category, city, photo_id, created_at`,
      [user.id, content, category, user.city, photo_id || null]
    );

    const post = result.rows[0];

    // Async: check new post against all watched names in this city (non-blocking)
    checkNewPostAgainstWatchedNames(post.id, content, user.city).catch(err => {
      console.error('Name Watch matching error (non-blocking):', err);
    });

    return res.status(201).json({
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
    return res.status(500).json({ error: 'Failed to create post' });
  }
};
