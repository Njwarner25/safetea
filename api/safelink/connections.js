const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

// GET /api/safelink/connections — returns all connection requests + accepted connections
// for the authenticated user, both as host and as requester.
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Incoming requests where I'm the host (active sessions only)
    const incoming = await getMany(
      `SELECT c.id, c.session_id, c.session_key, c.requester_user_id, c.message, c.status, c.created_at, c.responded_at,
              u.display_name, u.custom_display_name, u.avatar_url, u.identity_verified, u.trust_score
       FROM safelink_connections c
       JOIN users u ON u.id = c.requester_user_id
       JOIN safelink_sessions s ON s.id = c.session_id
       WHERE c.host_user_id = $1 AND s.status = 'active'
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    // Outgoing requests where I'm the requester
    const outgoing = await getMany(
      `SELECT c.id, c.session_id, c.session_key, c.host_user_id, c.status, c.created_at, c.responded_at,
              s.broadcast_message, s.category, s.label, s.status AS session_status,
              s.latitude, s.longitude,
              u.display_name, u.custom_display_name, u.avatar_url, u.identity_verified, u.trust_score
       FROM safelink_connections c
       JOIN safelink_sessions s ON s.id = c.session_id
       JOIN users u ON u.id = c.host_user_id
       WHERE c.requester_user_id = $1
       ORDER BY c.created_at DESC
       LIMIT 50`,
      [user.id]
    );

    const fmtUser = (r) => ({
      name: r.custom_display_name || r.display_name || 'SafeTea user',
      avatar: r.avatar_url || null,
      verified: r.identity_verified === true,
      trustScore: r.trust_score || 0,
    });

    return res.status(200).json({
      incoming: incoming.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        sessionKey: r.session_key,
        requesterUserId: r.requester_user_id,
        requester: fmtUser(r),
        message: r.message,
        status: r.status,
        createdAt: r.created_at,
        respondedAt: r.responded_at,
      })),
      outgoing: outgoing.map((r) => ({
        id: r.id,
        sessionId: r.session_id,
        sessionKey: r.session_key,
        hostUserId: r.host_user_id,
        host: fmtUser(r),
        status: r.status,
        sessionStatus: r.session_status,
        broadcastMessage: r.broadcast_message,
        category: r.category,
        label: r.label,
        // Only expose host coordinates if connection is accepted AND session still active
        hostLocation: (r.status === 'accepted' && r.session_status === 'active' && r.latitude != null && r.longitude != null)
          ? { latitude: parseFloat(r.latitude), longitude: parseFloat(r.longitude) }
          : null,
        createdAt: r.created_at,
        respondedAt: r.responded_at,
      })),
    });
  } catch (err) {
    console.error('SafeLink connections error:', err);
    return res.status(500).json({ error: 'Failed to load connections', details: err.message });
  }
};
