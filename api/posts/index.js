const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ========== GET: List posts ==========
  if (req.method === 'GET') {
    const feed = req.query.feed || 'safety';
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    try {
      const posts = await getMany(
        `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                p.likes, p.feed, p.image_url, p.created_at,
                u.display_name AS author_name,
                u.custom_display_name AS author_custom_name,
                u.avatar_color,
                (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE p.feed = $1
         ORDER BY p.created_at DESC
         LIMIT $2`,
        [feed, limit]
      );

      return res.status(200).json(posts);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load posts', details: err.message });
    }
  }

  // ========== POST: Create a post ==========
  if (req.method === 'POST') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body || {};
    const { title, body: postBody, category, city, feed, image_url } = body;

    if (!title || !postBody) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      const result = await getOne(
        `INSERT INTO posts (user_id, title, body, category, city, feed, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id`,
        [user.id, title, postBody, category || 'general', city || null, feed || 'safety', image_url || null]
      );

      return res.status(201).json({ id: result.id, message: 'Post created' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create post', details: err.message });
    }
  }

  // ========== PUT: Edit a post (requires ?id=) ==========
  if (req.method === 'PUT') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Post ID required (?id=)' });

    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwner = post.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to modify this post' });
    }

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

  // ========== DELETE: Delete a post (requires ?id=) ==========
  if (req.method === 'DELETE') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Post ID required (?id=)' });

    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwner = post.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to modify this post' });
    }

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
