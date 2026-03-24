const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Extract post ID from URL path
  const urlParts = req.url.split('/');
  const postId = urlParts[urlParts.length - 1].split('?')[0];

  if (!postId || isNaN(postId)) {
    return res.status(400).json({ error: 'Invalid post ID' });
  }

  try {
    // GET - fetch single post
    if (req.method === 'GET') {
      const post = await getOne(
        `SELECT p.*, u.display_name as author_name, u.role as author_role,
         (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) as reply_count
         FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
        [postId]
      );
      if (!post) return res.status(404).json({ error: 'Post not found' });
      return res.status(200).json(post);
    }

    // PUT - edit own post
    if (req.method === 'PUT') {
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const post = await getOne('SELECT * FROM posts WHERE id = $1', [postId]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // Only the author or admin can edit
      if (post.user_id !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only edit your own posts' });
      }

      const { title, body, category } = req.body || {};

      const fields = [];
      const values = [];
      let idx = 1;

      if (title !== undefined) { fields.push('title = $' + idx++); values.push(title); }
      if (body !== undefined) { fields.push('body = $' + idx++); values.push(body); }
      if (category !== undefined) { fields.push('category = $' + idx++); values.push(category); }

      if (fields.length === 0) {
        return res.status(400).json({ error: 'No fields to update' });
      }

      values.push(postId);
      await run(
        'UPDATE posts SET ' + fields.join(', ') + ' WHERE id = $' + idx,
        values
      );

      const updated = await getOne(
        `SELECT p.*, u.display_name as author_name
         FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1`,
        [postId]
      );

      return res.status(200).json({ message: 'Post updated', post: updated });
    }

    // DELETE - delete own post
    if (req.method === 'DELETE') {
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const post = await getOne('SELECT * FROM posts WHERE id = $1', [postId]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // Only the author or admin can delete
      if (post.user_id !== user.id && user.role !== 'admin') {
        return res.status(403).json({ error: 'You can only delete your own posts' });
      }

      // Delete replies first (cascade should handle this, but be safe)
      await run('DELETE FROM replies WHERE post_id = $1', [postId]);
      // Delete name watch matches
      try { await run('DELETE FROM name_watch_matches WHERE post_id = $1', [postId]); } catch(e) {}
      // Delete the post
      await run('DELETE FROM posts WHERE id = $1', [postId]);

      return res.status(200).json({ message: 'Post deleted' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Post [id] error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
