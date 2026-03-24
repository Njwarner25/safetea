const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const q = (req.query.q || '').trim();
  if (q.length < 2) {
    return res.status(400).json({ error: 'Query must be at least 2 characters' });
  }

  try {
    const users = await getMany(
      `SELECT id, display_name, custom_display_name, city, avatar_color
       FROM users
       WHERE id != $1
         AND (display_name ILIKE $2 OR custom_display_name ILIKE $2)
       ORDER BY display_name ASC
       LIMIT 20`,
      [user.id, '%' + q + '%']
    );

    return res.status(200).json({ users });
  } catch (err) {
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
