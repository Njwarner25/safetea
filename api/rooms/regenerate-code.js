const { cors, authenticate } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

function generateInviteCode(greekLetters) {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let suffix = '';
  for (let i = 0; i < 4; i++) {
    suffix += chars[Math.floor(Math.random() * chars.length)];
  }
  const letters = greekLetters.replace(/[^A-Za-z]/g, '').toUpperCase().slice(0, 6);
  return `SAFETEA-${letters}-${suffix}`;
}

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

    // Only the room admin (not co_admin) can regenerate codes
    const membership = await getOne(
      `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    if (!membership || membership.role !== 'admin') {
      return res.status(403).json({ error: 'Only the room admin can regenerate the invite code' });
    }

    const room = await getOne('SELECT greek_letters FROM sorority_rooms WHERE id = $1', [roomId]);
    if (!room) return res.status(404).json({ error: 'Room not found' });

    // Generate new unique code
    let newCode;
    let attempts = 0;
    while (attempts < 5) {
      newCode = generateInviteCode(room.greek_letters);
      const existing = await getOne('SELECT id FROM sorority_rooms WHERE invite_code = $1', [newCode]);
      if (!existing) break;
      attempts++;
    }
    if (attempts >= 5) {
      return res.status(500).json({ error: 'Failed to generate unique code, please try again' });
    }

    await getOne(
      'UPDATE sorority_rooms SET invite_code = $1 WHERE id = $2 RETURNING invite_code',
      [newCode, roomId]
    );

    return res.status(200).json({ inviteCode: newCode });
  } catch (err) {
    console.error('Regenerate code error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
