const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: 'Post ID required' });

  const post = await getOne('SELECT id FROM posts WHERE id = $1', [id]);
  if (!post) return res.status(404).json({ error: 'Post not found' });

  // POST = dislike (mutual exclusion: remove any existing like)
  if (req.method === 'POST') {
    try {
      // Remove existing like if any
      await run('DELETE FROM post_likes WHERE post_id = $1 AND user_id = $2', [id, user.id]);
      // Insert dislike
      await run(
        'INSERT INTO post_dislikes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
        [id, user.id]
      );
      const likeCount = await getOne('SELECT COUNT(*) as c FROM post_likes WHERE post_id = $1', [id]);
      const dislikeCount = await getOne('SELECT COUNT(*) as c FROM post_dislikes WHERE post_id = $1', [id]);
      // Update cached count on posts table
      await run('UPDATE posts SET dislike_count = $1 WHERE id = $2', [parseInt(dislikeCount.c), id]);
      return res.status(200).json({
        disliked: true,
        like_count: parseInt(likeCount.c),
        dislike_count: parseInt(dislikeCount.c)
      });
    } catch (err) {
      console.error('Dislike error:', err);
      return res.status(500).json({ error: 'Failed to dislike post' });
    }
  }

  // DELETE = remove dislike
  if (req.method === 'DELETE') {
    try {
      await run('DELETE FROM post_dislikes WHERE post_id = $1 AND user_id = $2', [id, user.id]);
      const likeCount = await getOne('SELECT COUNT(*) as c FROM post_likes WHERE post_id = $1', [id]);
      const dislikeCount = await getOne('SELECT COUNT(*) as c FROM post_dislikes WHERE post_id = $1', [id]);
      await run('UPDATE posts SET dislike_count = $1 WHERE id = $2', [parseInt(dislikeCount.c), id]);
      return res.status(200).json({
        disliked: false,
        like_count: parseInt(likeCount.c),
        dislike_count: parseInt(dislikeCount.c)
      });
    } catch (err) {
      console.error('Remove dislike error:', err);
      return res.status(500).json({ error: 'Failed to remove dislike' });
    }
  }

  // GET = check status
  if (req.method === 'GET') {
    try {
      const disliked = await getOne('SELECT id FROM post_dislikes WHERE post_id = $1 AND user_id = $2', [id, user.id]);
      const likeCount = await getOne('SELECT COUNT(*) as c FROM post_likes WHERE post_id = $1', [id]);
      const dislikeCount = await getOne('SELECT COUNT(*) as c FROM post_dislikes WHERE post_id = $1', [id]);
      return res.status(200).json({
        disliked: !!disliked,
        like_count: parseInt(likeCount.c),
        dislike_count: parseInt(dislikeCount.c)
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to get dislike status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
