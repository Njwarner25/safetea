const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Post ID required' });

  try {
    const post = await getOne('SELECT id, user_id, bump_count FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Can't bump your own post
    if (post.user_id === user.id) {
      return res.status(400).json({ error: 'You cannot bump your own post' });
    }

    // Check for existing bump
    const existing = await getOne(
      'SELECT id FROM post_bumps WHERE post_id = $1 AND user_id = $2',
      [id, user.id]
    );
    if (existing) {
      return res.status(409).json({ error: 'You already bumped this post' });
    }

    // Insert bump
    await run('INSERT INTO post_bumps (post_id, user_id) VALUES ($1, $2)', [id, user.id]);

    // Update post counts
    await run(
      'UPDATE posts SET bump_count = COALESCE(bump_count, 0) + 1, last_bumped_at = NOW() WHERE id = $1',
      [id]
    );

    const newCount = (parseInt(post.bump_count) || 0) + 1;
    return res.status(200).json({
      success: true,
      bump_count: newCount,
      trending: newCount >= 5
    });
  } catch (err) {
    console.error('Bump error:', err);
    return res.status(500).json({ error: 'Failed to bump post' });
  }
};
