const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const url = new URL(req.url, `http://${req.headers.host}`);
  const roomId = url.searchParams.get('roomId');
  if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

  // Verify caller is admin/co_admin of this room
  const callerMembership = await getOne(
    `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
    [roomId, user.id]
  );
  const isSafeTeaAdmin = user.role === 'admin' || user.role === 'moderator';
  const isRoomAdmin = callerMembership && (callerMembership.role === 'admin' || callerMembership.role === 'co_admin');

  if (!isRoomAdmin && !isSafeTeaAdmin) {
    return res.status(403).json({ error: 'Only room admins can manage members' });
  }

  // GET — list pending members
  if (req.method === 'GET') {
    try {
      const status = url.searchParams.get('status') || 'pending';
      const members = await getMany(
        `SELECT m.id AS membership_id, m.role, m.status, m.requested_at, m.approved_at, m.muted_until,
                u.id AS user_id, u.display_name, u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url, u.created_at AS joined_safetea
         FROM room_memberships m
         JOIN users u ON u.id = m.user_id
         WHERE m.room_id = $1 AND m.status = $2
         ORDER BY m.requested_at ASC`,
        [roomId, status]
      );
      return res.status(200).json({ members });
    } catch (err) {
      console.error('Members list error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // PUT — approve, deny, remove, mute, promote
  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { membershipId, action, muteDuration } = body;

      if (!membershipId || !action) {
        return res.status(400).json({ error: 'Membership ID and action are required' });
      }

      const target = await getOne(
        `SELECT m.*, u.display_name FROM room_memberships m JOIN users u ON u.id = m.user_id WHERE m.id = $1 AND m.room_id = $2`,
        [membershipId, roomId]
      );
      if (!target) return res.status(404).json({ error: 'Membership not found' });

      // Cannot modify room creator (original admin)
      const room = await getOne('SELECT created_by FROM sorority_rooms WHERE id = $1', [roomId]);
      if (target.user_id === room.created_by && action !== 'promote') {
        return res.status(403).json({ error: 'Cannot modify the room creator' });
      }

      switch (action) {
        case 'approve': {
          if (target.status !== 'pending') {
            return res.status(400).json({ error: 'Member is not in pending status' });
          }
          // Check room capacity
          const memberCount = await getOne(
            `SELECT COUNT(*) AS count FROM room_memberships WHERE room_id = $1 AND status = 'approved'`,
            [roomId]
          );
          if (parseInt(memberCount.count) >= 500) {
            return res.status(400).json({ error: 'Room has reached maximum capacity (500 members)' });
          }
          await run(
            `UPDATE room_memberships SET status = 'approved', approved_at = NOW(), approved_by = $1 WHERE id = $2`,
            [user.id, membershipId]
          );
          // Update member count
          await run(
            `UPDATE sorority_rooms SET member_count = (SELECT COUNT(*) FROM room_memberships WHERE room_id = $1 AND status = 'approved') WHERE id = $1`,
            [roomId]
          );
          return res.status(200).json({ success: true, action: 'approved', displayName: target.display_name });
        }

        case 'deny': {
          if (target.status !== 'pending') {
            return res.status(400).json({ error: 'Member is not in pending status' });
          }
          await run('UPDATE room_memberships SET status = $1 WHERE id = $2', ['denied', membershipId]);
          return res.status(200).json({ success: true, action: 'denied' });
        }

        case 'remove': {
          if (target.status !== 'approved') {
            return res.status(400).json({ error: 'Member is not currently approved' });
          }
          // Co-admins cannot remove other co-admins
          if (callerMembership.role === 'co_admin' && target.role === 'co_admin') {
            return res.status(403).json({ error: 'Co-admins cannot remove other co-admins' });
          }
          await run('UPDATE room_memberships SET status = $1 WHERE id = $2', ['removed', membershipId]);
          await run(
            `UPDATE sorority_rooms SET member_count = (SELECT COUNT(*) FROM room_memberships WHERE room_id = $1 AND status = 'approved') WHERE id = $1`,
            [roomId]
          );
          return res.status(200).json({ success: true, action: 'removed' });
        }

        case 'mute': {
          if (target.status !== 'approved') {
            return res.status(400).json({ error: 'Member is not currently approved' });
          }
          const durations = { '24h': 1, '7d': 7, '30d': 30 };
          const days = durations[muteDuration] || 1;
          const muteUntil = new Date(Date.now() + days * 24 * 60 * 60 * 1000);
          await run(
            'UPDATE room_memberships SET muted_until = $1 WHERE id = $2',
            [muteUntil.toISOString(), membershipId]
          );
          return res.status(200).json({ success: true, action: 'muted', mutedUntil: muteUntil });
        }

        case 'unmute': {
          await run('UPDATE room_memberships SET muted_until = NULL WHERE id = $1', [membershipId]);
          return res.status(200).json({ success: true, action: 'unmuted' });
        }

        case 'promote': {
          if (target.status !== 'approved') {
            return res.status(400).json({ error: 'Member is not currently approved' });
          }
          // Only the room admin (not co_admin) can promote
          if (callerMembership.role !== 'admin') {
            return res.status(403).json({ error: 'Only the room admin can promote members' });
          }
          // Max 3 co-admins
          const coAdmins = await getMany(
            `SELECT id FROM room_memberships WHERE room_id = $1 AND role = 'co_admin' AND status = 'approved'`,
            [roomId]
          );
          if (coAdmins.length >= 3) {
            return res.status(400).json({ error: 'Maximum 3 co-admins allowed' });
          }
          await run('UPDATE room_memberships SET role = $1 WHERE id = $2', ['co_admin', membershipId]);
          return res.status(200).json({ success: true, action: 'promoted' });
        }

        case 'demote': {
          if (callerMembership.role !== 'admin') {
            return res.status(403).json({ error: 'Only the room admin can demote co-admins' });
          }
          await run('UPDATE room_memberships SET role = $1 WHERE id = $2', ['member', membershipId]);
          return res.status(200).json({ success: true, action: 'demoted' });
        }

        default:
          return res.status(400).json({ error: 'Invalid action. Use: approve, deny, remove, mute, unmute, promote, demote' });
      }
    } catch (err) {
      console.error('Member action error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
