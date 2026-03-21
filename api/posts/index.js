const { getMany, getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    if (req.method === 'GET') {
      const { city, category, feed, page = 1, limit = 20 } = req.query;
      const offset = (parseInt(page) - 1) * parseInt(limit);
      let where = [];
      let params = [];
      let idx = 1;

      if (city) { where.push('p.city = $' + idx++); params.push(city); }
      if (category) { where.push('p.category = $' + idx++); params.push(category); }
      if (feed) { where.push('p.feed = $' + idx++); params.push(feed); }

      const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
      params.push(parseInt(limit), offset);

      const posts = await getMany(
        `SELECT p.*, u.display_name as author_name, u.role as author_role,
                (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) as reply_count
                FROM posts p JOIN users u ON p.user_id = u.id
                ${whereClause}
                ORDER BY reply_count DESC, p.created_at DESC LIMIT $${idx++} OFFSET $${idx}`,
        params
      );

      return res.status(200).json({ posts });
    }

    if (req.method === 'POST') {
      const user = await authenticate(req);
      if (!user) return res.status(401).json({ error: 'Not authenticated' });

      const { title, body, category, city, feed } = req.body;
      if (!title || !body) {
        return res.status(400).json({ error: 'Title and body are required' });
      }

      const result = await getOne(
        'INSERT INTO posts (user_id, title, body, category, city, feed) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [user.id, title, body, category || 'general', city || user.city, feed || 'safety']
      );

      return res.status(201).json({ message: 'Post created', post: result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Posts error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};