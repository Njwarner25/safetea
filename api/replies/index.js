const { getOne, getMany, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET - fetch replies for a post
  if (req.method === 'GET') {
    const postId = req.query.post_id;
    if (!postId) return res.status(400).json({ error: 'post_id is required' });

    try {
      const replies = await getMany(
        `SELECT r.id, r.post_id, r.user_id, COALESCE(r.content, r.body) AS body,
                r.created_at,
                COALESCE(u.custom_display_name, u.display_name) AS display_name,
                u.display_name AS username,
                u.avatar_color, u.avatar_initial
         FROM replies r JOIN users u ON r.user_id = u.id
         WHERE r.post_id = $1 ORDER BY r.created_at ASC`,
        [postId]
      );
      return res.status(200).json({ replies: replies || [] });
    } catch (error) {
      console.error('Load replies error:', error);
      return res.status(500).json({ error: 'Failed to load replies' });
    }
  }

  // POST - create a reply
  if (req.method === 'POST') {
    try {
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const body = await parseBody(req);
      const { post_id, content } = body;

      if (!post_id || !content || !content.trim()) {
        return res.status(400).json({ error: 'post_id and content are required' });
      }
      if (content.length > 1000) {
        return res.status(400).json({ error: 'Reply must be under 1000 characters' });
      }

      // Verify post exists
      const post = await getOne('SELECT id FROM posts WHERE id = $1', [post_id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      let reply;
      try {
        reply = await getOne(
          `INSERT INTO replies (post_id, user_id, content, body, created_at)
           VALUES ($1, $2, $3, $3, NOW()) RETURNING *`,
          [post_id, user.id, content.trim()]
        );
      } catch (e) {
        // Fallback if content column doesn't exist
        reply = await getOne(
          `INSERT INTO replies (post_id, user_id, body, created_at)
           VALUES ($1, $2, $3, NOW()) RETURNING *`,
          [post_id, user.id, content.trim()]
        );
      }

      // Update reply count and bump last_activity_at to keep post active in feed
      try {
        await run('UPDATE posts SET reply_count = COALESCE(reply_count, 0) + 1, last_activity_at = NOW() WHERE id = $1', [post_id]);
      } catch (e) {
        console.log('Could not update reply_count:', e.message);
      }

      return res.status(201).json({ reply });
    } catch (error) {
      console.error('Create reply error:', error);
      return res.status(500).json({ error: 'Failed to create reply' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
