const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const roomId = req.query.roomId || req.query.id;
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    // Only the creator (admin) can delete a room
    const membership = await getOne(
      `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only the room creator can delete a room' });
    }

    // Verify this user is actually the creator (not a promoted admin)
    const room = await getOne(`SELECT created_by FROM sorority_rooms WHERE id = $1`, [roomId]);
    if (!room || String(room.created_by) !== String(user.id)) {
      return res.status(403).json({ error: 'Only the original room creator can delete a room' });
    }

    // Delete in order: post likes, post replies, posts, memberships, room
    await run(`DELETE FROM room_post_likes WHERE post_id IN (SELECT id FROM room_posts WHERE room_id = $1)`, [roomId]);
    await run(`DELETE FROM room_replies WHERE post_id IN (SELECT id FROM room_posts WHERE room_id = $1)`, [roomId]);
    await run(`DELETE FROM room_posts WHERE room_id = $1`, [roomId]);
    await run(`DELETE FROM room_memberships WHERE room_id = $1`, [roomId]);
    await run(`DELETE FROM sorority_rooms WHERE id = $1`, [roomId]);

    return res.status(200).json({ success: true, message: 'Room deleted' });
  } catch (err) {
    console.error('Delete room error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
