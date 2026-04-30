const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const { getTrustLevel } = require('../_utils/trust-level');
const crypto = require('crypto');

function haversineDistanceFt(lat1, lng1, lat2, lng2) {
  const R = 20902231; // Earth radius in feet
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const trust = await getTrustLevel(user);
  if (trust.level < 2) {
    return res.status(403).json({
      error: 'Tether requires Trust Level 2 (Identity Light).',
      current_level: trust.level,
      progress: trust.progress
    });
  }

  try {
    const body = await parseBody(req);
    const { join_code, qr_token, current_lat, current_lng } = body;

    if (!join_code && !qr_token) {
      return res.status(400).json({ error: 'join_code or qr_token is required' });
    }
    if (current_lat == null || current_lng == null) {
      return res.status(400).json({ error: 'current_lat and current_lng are required' });
    }

    // Hash the provided code/token and look up session
    let session = null;
    if (join_code) {
      const hash = crypto.createHash('sha256').update(String(join_code).trim()).digest('hex');
      session = await getOne(
        `SELECT * FROM tether_sessions WHERE join_code_hash = $1 AND status = 'pending'`,
        [hash]
      );
    } else {
      const hash = crypto.createHash('sha256').update(String(qr_token).trim()).digest('hex');
      session = await getOne(
        `SELECT * FROM tether_sessions WHERE qr_token_hash = $1 AND status = 'pending'`,
        [hash]
      );
    }

    if (!session) {
      return res.status(404).json({ error: 'Session not found or no longer accepting members' });
    }

    // Check code expiry
    if (session.code_expires_at && new Date(session.code_expires_at) < new Date()) {
      return res.status(410).json({ error: 'Join code has expired. Ask the host to create a new session.' });
    }

    // Check member count
    const memberCount = await getOne(
      `SELECT COUNT(*)::int AS count FROM tether_members WHERE session_id = $1 AND status != 'ended'`,
      [session.id]
    );
    if (memberCount && memberCount.count >= session.max_members) {
      return res.status(400).json({ error: 'This Tether session is full.' });
    }

    // Check if user already in session
    const existing = await getOne(
      `SELECT id FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session.id, String(user.id)]
    );
    if (existing) {
      return res.status(409).json({ error: 'You are already in this session.' });
    }

    // GPS proximity check — must be within join_radius_ft of host
    const host = await getOne(
      `SELECT last_location_lat, last_location_lng FROM tether_members WHERE session_id = $1 AND role = 'host'`,
      [session.id]
    );

    if (host && host.last_location_lat != null && host.last_location_lng != null) {
      const distance = haversineDistanceFt(
        parseFloat(current_lat), parseFloat(current_lng),
        parseFloat(host.last_location_lat), parseFloat(host.last_location_lng)
      );
      const joinRadius = session.join_radius_ft || 100;
      if (distance > joinRadius) {
        return res.status(403).json({
          error: 'You must be physically near the group to join this Tether.',
          distance_ft: Math.round(distance),
          join_radius_ft: joinRadius
        });
      }
    }

    // Add member
    const displayName = user.custom_display_name || user.display_name || 'Member';
    await run(
      `INSERT INTO tether_members (session_id, user_id, display_name, role, status, last_location_lat, last_location_lng, last_location_updated_at)
       VALUES ($1, $2, $3, 'member', 'active', $4, $5, NOW())`,
      [session.id, String(user.id), displayName, parseFloat(current_lat), parseFloat(current_lng)]
    );

    // Log event
    await run(
      `INSERT INTO tether_events (session_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'member_joined', $3)`,
      [session.id, String(user.id), JSON.stringify({ display_name: displayName })]
    );

    // Return session + members
    const members = await getMany(
      `SELECT id, user_id, display_name, role, status, joined_at FROM tether_members WHERE session_id = $1 AND status != 'ended' ORDER BY joined_at`,
      [session.id]
    );

    return res.status(200).json({
      success: true,
      session,
      members
    });
  } catch (err) {
    console.error('Tether join error:', err);
    return res.status(500).json({ error: 'Failed to join Tether session', details: err.message });
  }
};
