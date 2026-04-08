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

  // Verified-only viewing (anti-stalker gate symmetric with hosting)
  const isVerified = user.identity_verified === true || (typeof user.trust_score === 'number' && user.trust_score >= 60);
  if (!isVerified) {
    return res.status(403).json({
      error: 'Identity verification required to discover SafeLink broadcasts',
      code: 'verification_required',
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
    }));

    return res.status(200).json({ broadcasts });
  } catch (err) {
    console.error('SafeLink discover error:', err);
    return res.status(500).json({ error: 'Failed to load broadcasts', details: err.message });
  }
};
