const { cors, authenticate } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const postId = url.searchParams.get('postId');
    if (!postId) return res.status(400).json({ error: 'Post ID is required' });

    const post = await getOne('SELECT room_id FROM room_posts WHERE id = $1', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Verify membership
    const membership = await getOne(
      `SELECT id FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [post.room_id, user.id]
    );
    if (!membership) return res.status(403).json({ error: 'You are not a member of this room' });

    // Toggle like
    const existing = await getOne(
      'SELECT id FROM room_post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, user.id]
    );

    if (existing) {
      await run('DELETE FROM room_post_likes WHERE id = $1', [existing.id]);
      return res.status(200).json({ liked: false });
    } else {
      await run(
        'INSERT INTO room_post_likes (post_id, user_id) VALUES ($1, $2)',
        [postId, user.id]
      );
      return res.status(200).json({ liked: true });
    }
  } catch (err) {
    console.error('Room like error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
