const { cors, authenticate } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');
const { getTrustLevel, gateResponse } = require('../_utils/trust-level');

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

    // Trust Level gate — Level 1+ (phone verified) to read room posts.
    // Level 0 visitors get a stripped preview (last 5 posts, body truncated).
    const trust = await getTrustLevel(user);
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    const previewMode = !trust.permissions.canReadPosts && !isAdmin;

    // Verify membership (invite-only)
    const membership = await getOne(
      `SELECT id FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [roomId, user.id]
    );
    if (!membership && !isAdmin) {
      return res.status(403).json({ error: 'You need an invite code to join this room.' });
    }

    // Visitor preview mode: cap to 5 most-recent posts
    const effectiveLimit = previewMode ? Math.min(limit, 5) : limit;

    let typeFilter = '';
    const params = [roomId, user.id, effectiveLimit, offset];
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

    // In preview mode, truncate post bodies + strip images (visitors get a teaser only)
    const finalPosts = previewMode
      ? posts.map(function(p) { return Object.assign({}, p, { body: (p.body || '').substring(0, 140) + (p.body && p.body.length > 140 ? '…' : ''), image_data: null, _preview: true }); })
      : posts;

    return res.status(200).json({
      posts: finalPosts,
      trust: { level: trust.level, label: trust.label, preview_mode: previewMode },
      upgrade: previewMode ? gateResponse('canReadPosts', trust) : null
    });
  } catch (err) {
    console.error('Room feed error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
