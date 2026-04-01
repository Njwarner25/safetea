const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const body = await parseBody(req);
    const { roomId, name, chapter, university, scope, description, colorPrimary, colorSecondary, logoUrl } = body;

    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    // Verify admin/co_admin role
    const membership = await getOne(
      `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    if (!membership || (membership.role !== 'admin' && membership.role !== 'co_admin')) {
      return res.status(403).json({ error: 'Only room admins can update settings' });
    }

    const validScopes = ['chapter', 'university', 'regional', 'national'];

    // Build update dynamically for provided fields only
    const updates = [];
    const params = [];
    let paramIndex = 1;

    if (name !== undefined) {
      if (!name.trim() || name.length > 100) {
        return res.status(400).json({ error: 'Room name must be 1-100 characters' });
      }
      updates.push(`name = $${paramIndex++}`);
      params.push(name.trim());
    }
    if (chapter !== undefined) { updates.push(`chapter = $${paramIndex++}`); params.push(chapter?.trim() || null); }
    if (university !== undefined) { updates.push(`university = $${paramIndex++}`); params.push(university?.trim() || null); }
    if (scope !== undefined && validScopes.includes(scope)) { updates.push(`scope = $${paramIndex++}`); params.push(scope); }
    if (description !== undefined) { updates.push(`description = $${paramIndex++}`); params.push(description?.trim() || null); }
    if (colorPrimary !== undefined) { updates.push(`color_primary = $${paramIndex++}`); params.push(colorPrimary); }
    if (colorSecondary !== undefined) { updates.push(`color_secondary = $${paramIndex++}`); params.push(colorSecondary); }
    if (logoUrl !== undefined) { updates.push(`logo_url = $${paramIndex++}`); params.push(logoUrl || null); }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    params.push(roomId);
    const room = await getOne(
      `UPDATE sorority_rooms SET ${updates.join(', ')} WHERE id = $${paramIndex} RETURNING *`,
      params
    );

    if (!room) return res.status(404).json({ error: 'Room not found' });

    return res.status(200).json(room);
  } catch (err) {
    console.error('Room settings error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
