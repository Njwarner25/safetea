const { cors, authenticate } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const roomId = url.searchParams.get('roomId');
    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    const membership = await getOne(
      `SELECT * FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    if (!membership) return res.status(404).json({ error: 'You are not a member of this room' });

    // Room creator (admin) cannot leave — they must archive the room instead
    const room = await getOne('SELECT created_by FROM sorority_rooms WHERE id = $1', [roomId]);
    if (room && room.created_by === user.id) {
      return res.status(400).json({ error: 'Room creator cannot leave. Archive the room instead.' });
    }

    await run('UPDATE room_memberships SET status = $1 WHERE id = $2', ['removed', membership.id]);

    // Update member count
    await run(
      `UPDATE sorority_rooms SET member_count = (SELECT COUNT(*) FROM room_memberships WHERE room_id = $1 AND status = 'approved') WHERE id = $1`,
      [roomId]
    );

    return res.status(200).json({ success: true, message: 'You have left the room' });
  } catch (err) {
    console.error('Room leave error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
