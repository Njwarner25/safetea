const { cors, authenticate } = require('../_utils/auth');
const { getMany, getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin' && user.role !== 'moderator') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    // GET — list reported room posts
    if (req.method === 'GET') {
      const reports = await getMany(
        `SELECT rpr.post_id, rp.body AS post_body, rp.author_id,
                u.display_name AS author_name,
                sr.name AS room_name,
                COUNT(rpr.id) AS report_count,
                STRING_AGG(DISTINCT rpr.reason, ', ') AS reasons,
                STRING_AGG(rpr.details, ' | ') FILTER (WHERE rpr.details IS NOT NULL) AS details
         FROM room_post_reports rpr
         JOIN room_posts rp ON rp.id = rpr.post_id
         JOIN users u ON u.id = rp.author_id
         JOIN sorority_rooms sr ON sr.id = rp.room_id
         WHERE rp.deleted_by_admin = FALSE
         GROUP BY rpr.post_id, rp.body, rp.author_id, u.display_name, sr.name
         ORDER BY COUNT(rpr.id) DESC, MAX(rpr.created_at) DESC
         LIMIT 50`,
        []
      );
      return res.status(200).json({ reports });
    }

    // POST — take action on a reported post
    if (req.method === 'POST') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const { postId, action } = body;

      if (!postId) return res.status(400).json({ error: 'postId required' });

      if (action === 'dismiss') {
        await run('DELETE FROM room_post_reports WHERE post_id = $1', [postId]);
        await run('UPDATE room_posts SET is_flagged = FALSE WHERE id = $1', [postId]);
        return res.status(200).json({ success: true, message: 'Reports dismissed' });
      }

      if (action === 'remove') {
        await run('UPDATE room_posts SET deleted_by_admin = TRUE WHERE id = $1', [postId]);
        await run('DELETE FROM room_post_reports WHERE post_id = $1', [postId]);
        return res.status(200).json({ success: true, message: 'Post removed' });
      }

      return res.status(400).json({ error: 'Invalid action. Use dismiss or remove.' });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Room reports admin error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
