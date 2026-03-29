const { getOne, getMany, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query; // post id
  if (!id) return res.status(400).json({ error: 'Post ID required' });

  const post = await getOne('SELECT id FROM posts WHERE id = $1', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // GET = list replies
  if (req.method === 'GET') {
    try {
      const replies = await getMany(
        `SELECT r.id, r.body, r.created_at, r.user_id,
                u.display_name, u.avatar_color, u.avatar_initial
         FROM replies r
         JOIN users u ON u.id = r.user_id
         WHERE r.post_id = $1
         ORDER BY r.created_at ASC`,
        [id]
      );
      return res.status(200).json({ replies });
    } catch (err) {
      console.error('List replies error:', err);
      return res.status(500).json({ error: 'Failed to load replies' });
    }
  }

  // POST = create reply
  if (req.method === 'POST') {
    try {
      const { body } = await parseBody(req);
      if (!body || body.trim().length === 0) {
        return res.status(400).json({ error: 'Reply body is required' });
      }
      if (body.length > 1000) {
        return res.status(400).json({ error: 'Reply must be under 1000 characters' });
      }

      const reply = await getOne(
        `INSERT INTO replies (post_id, user_id, body)
         VALUES ($1, $2, $3) RETURNING id, body, created_at`,
        [id, user.id, body.trim()]
      );

      // Update reply count on the post
      await run(
        'UPDATE posts SET reply_count = COALESCE(reply_count, 0) + 1 WHERE id = $1',
        [id]
      );

      return res.status(201).json({
        ...reply,
        user_id: user.id,
        display_name: user.display_name,
        avatar_color: user.avatar_color,
        avatar_initial: user.avatar_initial
      });
    } catch (err) {
      console.error('Create reply error:', err);
      return res.status(500).json({ error: 'Failed to create reply' });
    }
  }

  // DELETE = delete reply (owner or admin/moderator)
  if (req.method === 'DELETE') {
    try {
      const { reply_id } = req.query;
      if (!reply_id) return res.status(400).json({ error: 'reply_id required' });

      const reply = await getOne('SELECT * FROM replies WHERE id = $1', [reply_id]);
      if (!reply) return res.status(404).json({ error: 'Reply not found' });

      const isOwner = reply.user_id === user.id;
      const isAdmin = user.role === 'admin' || user.role === 'moderator';
      if (!isOwner && !isAdmin) {
        return res.status(403).json({ error: 'Not authorized' });
      }

      await run('DELETE FROM replies WHERE id = $1', [reply_id]);
      await run(
        'UPDATE posts SET reply_count = GREATEST(COALESCE(reply_count, 0) - 1, 0) WHERE id = $1',
        [id]
      );

      return res.status(200).json({ deleted: true });
    } catch (err) {
      console.error('Delete reply error:', err);
      return res.status(500).json({ error: 'Failed to delete reply' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
