const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

// Returns active public SafeLink broadcasts. Requires authenticated + verified user.
// Hides exact coordinates — only returns user's session_key, broadcast_message,
// category, and host display info. Coordinates only revealed after a connection is accepted.
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Perfect-trust viewing (anti-stalker gate symmetric with hosting)
  const trustScore = typeof user.trust_score === 'number' ? user.trust_score : 0;
  if (trustScore < 100) {
    return res.status(403).json({
      error: 'Browsing SafeLink broadcasts requires a perfect trust score (100/100). Complete every verification step in your profile to unlock.',
      code: 'trust_score_required',
      required: 100,
      current: trustScore,
    });
  }

  try {
    const rows = await getMany(
      `SELECT
         s.id,
         s.session_key,
         s.user_id,
         s.label,
         s.broadcast_message,
         s.category,
         s.created_at,
         s.latitude,
         s.longitude,
         u.display_name,
         u.custom_display_name,
         u.avatar_url,
         u.identity_verified,
         u.trust_score,
         (SELECT COUNT(*) FROM safelink_connections c
            WHERE c.session_id = s.id AND c.status = 'accepted') AS accepted_count,
         (SELECT status FROM safelink_connections c
            WHERE c.session_id = s.id AND c.requester_user_id = $1 LIMIT 1) AS my_request_status
       FROM safelink_sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.status = 'active'
         AND s.is_public = TRUE
         AND s.user_id != $1
         AND s.created_at > NOW() - INTERVAL '6 hours'
       ORDER BY s.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const broadcasts = rows.map((r) => ({
      sessionKey: r.session_key,
      sessionId: r.id,
      hostUserId: r.user_id,
      hostName: r.custom_display_name || r.display_name || 'SafeTea user',
      hostAvatar: r.avatar_url || null,
      hostVerified: r.identity_verified === true,
      hostTrustScore: r.trust_score || 0,
      label: r.label,
      broadcastMessage: r.broadcast_message,
      category: r.category,
      createdAt: r.created_at,
      acceptedCount: parseInt(r.accepted_count || 0, 10),
      myRequestStatus: r.my_request_status || null,
      // Approximate location (~1km precision) for community map — not exact
      approxLat: r.latitude ? Math.round(r.latitude * 100) / 100 : null,
      approxLng: r.longitude ? Math.round(r.longitude * 100) / 100 : null,
    }));

    return res.status(200).json({ broadcasts });
  } catch (err) {
    console.error('SafeLink discover error:', err);
    return res.status(500).json({ error: 'Failed to load broadcasts', details: err.message });
  }
};
