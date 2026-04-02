const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const postId = url.searchParams.get('postId');
  if (!postId) return res.status(400).json({ error: 'Post ID is required' });

  // Verify the post exists
  const post = await getOne('SELECT room_id FROM room_posts WHERE id = $1', [postId]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Trust score gate
  if ((user.trust_score || 0) < 70) {
    return res.status(403).json({ error: 'trust_score_too_low', required: 70 });
  }

  // GET — list replies
  if (req.method === 'GET') {
    try {
      const replies = await getMany(
        `SELECT r.*, u.display_name AS author_name, u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url
         FROM room_replies r
         JOIN users u ON u.id = r.author_id
         WHERE r.post_id = $1
         ORDER BY r.created_at ASC`,
        [postId]
      );
      return res.status(200).json({ replies });
    } catch (err) {
      console.error('Room replies list error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // POST — create reply
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      if (!body.text?.trim()) return res.status(400).json({ error: 'Reply text is required' });

      const reply = await getOne(
        `INSERT INTO room_replies (post_id, author_id, body) VALUES ($1, $2, $3) RETURNING *`,
        [postId, user.id, body.text.trim()]
      );

      return res.status(201).json(reply);
    } catch (err) {
      console.error('Room reply create error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // DELETE — delete reply (author or SafeTea admin)
  if (req.method === 'DELETE') {
    try {
      const replyId = url.searchParams.get('replyId');
      if (!replyId) return res.status(400).json({ error: 'Reply ID is required' });

      const reply = await getOne('SELECT * FROM room_replies WHERE id = $1', [replyId]);
      if (!reply) return res.status(404).json({ error: 'Reply not found' });

      const isAuthor = reply.author_id === user.id;
      const isSafeTeaAdmin = user.role === 'admin' || user.role === 'moderator';
      if (!isAuthor && !isSafeTeaAdmin) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      await run('DELETE FROM room_replies WHERE id = $1', [replyId]);
      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Room reply delete error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
