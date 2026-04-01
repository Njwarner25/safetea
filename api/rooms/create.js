const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

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
    // Check admin limit: max 2 rooms as admin
    const adminRooms = await getMany(
      `SELECT id FROM sorority_rooms WHERE created_by = $1 AND status != 'archived'`,
      [user.id]
    );
    if (adminRooms.length >= 2) {
      return res.status(400).json({ error: 'You can create a maximum of 2 rooms' });
    }

    const body = await parseBody(req);
    const { name, greekLetters, chapter, university, scope, description, colorPrimary, colorSecondary, logoUrl } = body;

    if (!name || !greekLetters) {
      return res.status(400).json({ error: 'Room name and Greek letters are required' });
    }

    if (name.length > 100) {
      return res.status(400).json({ error: 'Room name must be 100 characters or less' });
    }

    const validScopes = ['chapter', 'university', 'regional', 'national'];
    const roomScope = validScopes.includes(scope) ? scope : 'chapter';

    // Generate unique invite code (retry on collision)
    let inviteCode;
    let attempts = 0;
    while (attempts < 5) {
      inviteCode = generateInviteCode(greekLetters);
      const existing = await getOne('SELECT id FROM sorority_rooms WHERE invite_code = $1', [inviteCode]);
      if (!existing) break;
      attempts++;
    }
    if (attempts >= 5) {
      return res.status(500).json({ error: 'Failed to generate unique invite code, please try again' });
    }

    const room = await getOne(
      `INSERT INTO sorority_rooms (name, greek_letters, chapter, university, scope, description, color_primary, color_secondary, logo_url, invite_code, created_by, member_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 1)
       RETURNING *`,
      [
        name.trim(),
        greekLetters.trim().slice(0, 20),
        chapter?.trim() || null,
        university?.trim() || null,
        roomScope,
        description?.trim() || null,
        colorPrimary || '#E8A0B5',
        colorSecondary || '#1A1A2E',
        logoUrl || null,
        inviteCode,
        user.id
      ]
    );

    // Auto-add creator as admin member
    await getOne(
      `INSERT INTO room_memberships (room_id, user_id, role, status, approved_at, approved_by)
       VALUES ($1, $2, 'admin', 'approved', NOW(), $2)
       RETURNING id`,
      [room.id, user.id]
    );

    return res.status(201).json(room);
  } catch (err) {
    console.error('Room create error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
