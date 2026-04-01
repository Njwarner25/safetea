const { cors, authenticate } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const rooms = await getMany(
      `SELECT r.*, m.role AS my_role, m.status AS my_status,
              (SELECT COUNT(*) FROM room_memberships WHERE room_id = r.id AND status = 'pending') AS pending_count
       FROM sorority_rooms r
       JOIN room_memberships m ON m.room_id = r.id AND m.user_id = $1
       WHERE m.status = 'approved' AND r.status != 'suspended'
       ORDER BY r.created_at DESC`,
      [user.id]
    );

    return res.status(200).json({ rooms });
  } catch (err) {
    console.error('My rooms error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
