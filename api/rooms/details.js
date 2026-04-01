const { cors, authenticate } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('id');
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    // Verify membership
    const membership = await getOne(
      `SELECT * FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!membership && !isAdmin) {
      return res.status(403).json({ error: 'You are not a member of this room' });
    }

    const room = await getOne(
      `SELECT r.*,
              (SELECT display_name FROM users WHERE id = r.created_by) AS creator_name
       FROM sorority_rooms r WHERE r.id = $1`,
      [roomId]
    );
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Get members list (approved only)
    const members = await getMany(
      `SELECT m.id AS membership_id, m.role, m.status, m.approved_at, m.muted_until,
              u.id AS user_id, u.display_name, u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url, u.created_at AS joined_safetea
       FROM room_memberships m
       JOIN users u ON u.id = m.user_id
       WHERE m.room_id = $1 AND m.status = 'approved'
       ORDER BY m.role ASC, m.approved_at ASC`,
      [roomId]
    );

    // If user is admin/co_admin, also get pending requests
    let pending = [];
    if (membership && (membership.role === 'admin' || membership.role === 'co_admin')) {
      pending = await getMany(
        `SELECT m.id AS membership_id, m.requested_at,
                u.id AS user_id, u.display_name, u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url, u.created_at AS joined_safetea
         FROM room_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1 AND m.status = 'pending'
         ORDER BY m.requested_at ASC`,
        [roomId]
      );
    }

    return res.status(200).json({
      room,
      myRole: membership?.role || (isAdmin ? 'safetea_admin' : null),
      members,
      pending,
      memberCount: members.length
    });
  } catch (err) {
    console.error('Room details error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
