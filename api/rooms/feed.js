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
    const roomId = url.searchParams.get('roomId');
    const type = url.searchParams.get('type');
    const limit = Math.min(parseInt(url.searchParams.get('limit')) || 20, 50);
    const offset = parseInt(url.searchParams.get('offset')) || 0;

    if (!roomId) return res.status(400).json({ error: 'Room ID is required' });

    // Verification gate: must be verified OR within 90-day grace period
    const verificationDeadline = user.verification_deadline ? new Date(user.verification_deadline) : null;
    const withinGracePeriod = user.identity_verified || !verificationDeadline || verificationDeadline > new Date();
    if (!withinGracePeriod) {
      return res.status(403).json({ error: 'verification_required', message: 'Your 90-day verification window has ended. Please verify your identity to access rooms.' });
    }

    // Verify membership (invite-only)
    const membership = await getOne(
      `SELECT id FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!membership && !isAdmin) {
      return res.status(403).json({ error: 'You need an invite code to join this room.' });
    }

    let typeFilter = '';
    const params = [roomId, user.id, limit, offset];
    // Good Guys removed 2026-04 — only tea_talk type is valid going forward
    if (type === 'tea_talk') {
      typeFilter = `AND p.type = $5`;
      params.push(type);
    }

    const posts = await getMany(
      `SELECT p.id, p.room_id, p.author_id, p.type, p.body, p.image_data,
              p.pinned, p.created_at, p.bump_count, p.last_bumped_at,
              u.display_name AS author_name, u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url,
              (SELECT COUNT(*) FROM room_replies WHERE post_id = p.id) AS reply_count,
              (SELECT COUNT(*) FROM room_post_likes WHERE post_id = p.id AND reaction = 'like') AS like_count,
              (SELECT COUNT(*) FROM room_post_likes WHERE post_id = p.id AND reaction = 'dislike') AS dislike_count,
              (SELECT reaction FROM room_post_likes WHERE post_id = p.id AND user_id = $2) AS user_reaction
       FROM room_posts p
       JOIN users u ON u.id = p.author_id
       WHERE p.room_id = $1 AND p.deleted_by_admin = FALSE AND p.deleted_by_ai = FALSE
       ${typeFilter}
       ORDER BY p.pinned DESC, COALESCE(p.last_bumped_at, p.created_at) DESC
       LIMIT $3 OFFSET $4`,
      params
    );

    return res.status(200).json({ posts });
  } catch (err) {
    console.error('Room feed error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
