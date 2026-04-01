const { getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Post ID required' });

  const post = await getOne('SELECT id FROM posts WHERE id = $1', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // Ensure post_likes table exists
  try {
    await run(`CREATE TABLE IF NOT EXISTS post_likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )`);
  } catch(e) { /* already exists */ }

  // POST = like (mutual exclusion: remove any existing dislike)
  if (req.method === 'POST') {
    try {
      try { await run('DELETE FROM post_dislikes WHERE post_id = $1 AND user_id = $2', [id, user.id]); } catch(e) { /* table may not exist yet */ }
      await run(
        'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
        [id, user.id]
      );
      const count = await getOne('SELECT COUNT(*) as like_count FROM post_likes WHERE post_id = $1', [id]);
      let dislike_count = 0;
      try {
        const dc = await getOne('SELECT COUNT(*) as c FROM post_dislikes WHERE post_id = $1', [id]);
        dislike_count = parseInt(dc.c);
        await run('UPDATE posts SET dislike_count = $1 WHERE id = $2', [dislike_count, id]);
      } catch(e) { /* table may not exist yet */ }
      return res.status(200).json({ liked: true, like_count: parseInt(count.like_count), dislike_count });
    } catch (err) {
      console.error('Like error:', err);
      return res.status(500).json({ error: 'Failed to like post' });
    }
  }

  // DELETE = unlike
  if (req.method === 'DELETE') {
    try {
      await run('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, user.id]);
      const count = await getOne('SELECT COUNT(*) as like_count FROM post_likes WHERE post_id = $1', [id]);
      return res.status(200).json({ liked: false, like_count: parseInt(count.like_count) });
    } catch (err) {
      console.error('Unlike error:', err);
      return res.status(500).json({ error: 'Failed to unlike post' });
    }
  }

  // GET = check status
  if (req.method === 'GET') {
    try {
      const liked = await getOne('SELECT id FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, user.id]);
      const count = await getOne('SELECT COUNT(*) as like_count FROM post_likes WHERE post_id = $1', [id]);
      return res.status(200).json({ liked: !!liked, like_count: parseInt(count.like_count) });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to get like status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
