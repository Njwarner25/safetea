const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const city = req.query.city || null;
  const category = req.query.category || null;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    let where = "p.feed = 'community'";
    const params = [];
    let paramIdx = 0;

    if (city) {
      paramIdx++;
      where += ` AND p.city ILIKE $${paramIdx}`;
      params.push('%' + city + '%');
    }
    if (category) {
      paramIdx++;
      where += ` AND p.category = $${paramIdx}`;
      params.push(category);
    }

    paramIdx++;
    const limitParam = `$${paramIdx}`;
    params.push(limit);

    // user_liked subquery
    paramIdx++;
    params.push(user.id);
    const userLikedSelect = `EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $${paramIdx}) AS user_liked`;

    const posts = await getMany(
      `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
              p.feed, p.created_at,
              u.display_name AS author_name,
              u.custom_display_name AS author_custom_name,
              u.avatar_color, u.avatar_initial,
              (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
              ${userLikedSelect}
       FROM posts p
       LEFT JOIN users u ON u.id = p.user_id
       WHERE ${where}
       ORDER BY (SELECT COUNT(*) FROM post_likes pl3 WHERE pl3.post_id = p.id) + (SELECT COUNT(*) FROM replies r2 WHERE r2.post_id = p.id) DESC, p.created_at DESC
       LIMIT ${limitParam}`,
      params
    );

    return res.status(200).json(posts);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load community posts', details: err.message });
  }
};
