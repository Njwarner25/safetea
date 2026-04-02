const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const body = await parseBody(req);
    const { inviteCode } = body;

    if (!inviteCode) {
      return res.status(400).json({ error: 'Invite code is required' });
    }

    // Normalize: case-insensitive, trim whitespace
    const code = inviteCode.trim().toUpperCase();

    const room = await getOne(
      `SELECT * FROM sorority_rooms WHERE UPPER(invite_code) = $1 AND status = 'active'`,
      [code]
    );
    if (!room) {
      return res.status(404).json({ error: 'Invalid invite code or room is no longer active' });
    }

    // Check room member limit
    if (room.member_count >= 500) {
      return res.status(400).json({ error: 'This room has reached its maximum capacity (500 members)' });
    }

    // Check user membership limit: max 5 rooms
    const membershipCount = await getMany(
      `SELECT id FROM room_memberships WHERE user_id = $1 AND status = 'approved'`,
      [user.id]
    );
    if (membershipCount.length >= 5) {
      return res.status(400).json({ error: 'You can join a maximum of 5 rooms' });
    }

    // Check if already a member or has pending request
    const existing = await getOne(
      `SELECT * FROM room_memberships WHERE room_id = $1 AND user_id = $2`,
      [room.id, user.id]
    );

    if (existing) {
      if (existing.status === 'approved') {
        return res.status(409).json({ error: 'You are already a member of this room', roomId: room.id, roomName: room.name });
      }
      if (existing.status === 'pending') {
        // Auto-approve since they have a valid invite code
        await getOne(
          `UPDATE room_memberships SET status = 'approved', approved_at = NOW()
           WHERE id = $1 RETURNING *`,
          [existing.id]
        );
        await getOne(`UPDATE sorority_rooms SET member_count = member_count + 1 WHERE id = $1 RETURNING id`, [room.id]);
        return res.status(200).json({ message: 'Welcome to ' + room.name + '!', roomId: room.id, roomName: room.name, status: 'approved' });
      }
      if (existing.status === 'denied' || existing.status === 'removed') {
        // Re-admit with valid invite code
        await getOne(
          `UPDATE room_memberships SET status = 'approved', requested_at = NOW(), approved_at = NOW()
           WHERE id = $1 RETURNING *`,
          [existing.id]
        );
        await getOne(`UPDATE sorority_rooms SET member_count = member_count + 1 WHERE id = $1 RETURNING id`, [room.id]);
        return res.status(200).json({ message: 'Welcome back to ' + room.name + '!', roomId: room.id, roomName: room.name, status: 'approved' });
      }
    }

    // Auto-approve — invite code grants immediate access
    await getOne(
      `INSERT INTO room_memberships (room_id, user_id, role, status, approved_at)
       VALUES ($1, $2, 'member', 'approved', NOW())
       RETURNING id`,
      [room.id, user.id]
    );

    // Increment member count
    await getOne(`UPDATE sorority_rooms SET member_count = member_count + 1 WHERE id = $1 RETURNING id`, [room.id]);

    return res.status(200).json({ message: 'Welcome to ' + room.name + '!', roomId: room.id, roomName: room.name, status: 'approved' });
  } catch (err) {
    console.error('Room join error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
