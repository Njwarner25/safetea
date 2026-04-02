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

    const post = await getOne('SELECT * FROM room_posts WHERE id = $1', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Trust score gate
    if ((user.trust_score || 0) < 70) {
      return res.status(403).json({ error: 'trust_score_too_low', required: 70 });
    }

    // Bump the post — increment count + update timestamp so it sorts higher
    await run(
      `UPDATE room_posts SET bump_count = COALESCE(bump_count, 0) + 1, last_bumped_at = NOW() WHERE id = $1`,
      [postId]
    );

    var newCount = (parseInt(post.bump_count) || 0) + 1;
    return res.status(200).json({ success: true, bumpCount: newCount });
  } catch (err) {
    console.error('Room bump error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
