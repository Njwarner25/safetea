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
        return res.status(409).json({ error: 'You are already a member of this room' });
      }
      if (existing.status === 'pending') {
        return res.status(409).json({ error: 'You already have a pending request for this room' });
      }
      if (existing.status === 'denied' || existing.status === 'removed') {
        // Allow re-request: update existing row back to pending
        await getOne(
          `UPDATE room_memberships SET status = 'pending', requested_at = NOW(), approved_at = NULL, approved_by = NULL
           WHERE id = $1 RETURNING *`,
          [existing.id]
        );
        return res.status(200).json({ message: 'Join request submitted', roomName: room.name, status: 'pending' });
      }
    }

    // Create pending membership
    await getOne(
      `INSERT INTO room_memberships (room_id, user_id, role, status)
       VALUES ($1, $2, 'member', 'pending')
       RETURNING id`,
      [room.id, user.id]
    );

    return res.status(200).json({ message: 'Join request submitted', roomName: room.name, status: 'pending' });
  } catch (err) {
    console.error('Room join error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
