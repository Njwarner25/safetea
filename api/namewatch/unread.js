const { authenticate, cors } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const result = await getOne(
      `SELECT COUNT(*) as count FROM name_watch_matches nwm
       JOIN watched_names wn ON nwm.watched_name_id = wn.id
       WHERE wn.user_id = $1 AND nwm.is_read = false`,
      [user.id]
    );
    return res.json({ count: parseInt(result.count) });
  } catch (err) {
    console.error('Unread count error:', err);
    return res.status(500).json({ error: 'Failed to get unread count' });
  }
};
