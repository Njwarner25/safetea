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

    // Only room admin/co_admin can pin
    const membership = await getOne(
      `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [post.room_id, user.id]
    );
    if (!membership || (membership.role !== 'admin' && membership.role !== 'co_admin')) {
      return res.status(403).json({ error: 'Only room admins can pin posts' });
    }

    // Toggle pin
    const newPinned = !post.pinned;
    await run('UPDATE room_posts SET pinned = $1 WHERE id = $2', [newPinned, postId]);

    return res.status(200).json({ pinned: newPinned });
  } catch (err) {
    console.error('Room pin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
