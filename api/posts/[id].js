const { authenticate, cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Post ID required' });

  const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  const isOwner = post.user_id === user.id;
  const isAdmin = user.role === 'admin' || user.role === 'moderator';

  if (!isOwner && !isAdmin) {
    return res.status(403).json({ error: 'Not authorized to modify this post' });
  }

  // ========== PUT: Edit a post ==========
  if (req.method === 'PUT') {
    const body = req.body || {};
    const { title, body: postBody, category, city } = body;

    if (!postBody || !postBody.trim()) {
      return res.status(400).json({ error: 'Post body is required' });
    }

    try {
      await run(
        `UPDATE posts SET title = $1, body = $2, category = COALESCE($3, category), city = COALESCE($4, city)
         WHERE id = $5`,
        [title || postBody.substring(0, 60), postBody.trim(), category || null, city || null, id]
      );

      return res.status(200).json({ message: 'Post updated' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update post', details: err.message });
    }
  }

  // ========== DELETE: Delete a post ==========
  if (req.method === 'DELETE') {
    try {
      await run('DELETE FROM replies WHERE post_id = $1', [id]);
      await run('DELETE FROM posts WHERE id = $1', [id]);

      return res.status(200).json({ message: 'Post deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete post', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
