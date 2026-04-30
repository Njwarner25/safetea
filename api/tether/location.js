const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

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

  try {
    const body = await parseBody(req);
    const { session_id, lat, lng } = body;

    if (!session_id || lat == null || lng == null) {
      return res.status(400).json({ error: 'session_id, lat, and lng are required' });
    }

    // Verify session is active
    const session = await getOne(
      `SELECT * FROM tether_sessions WHERE id = $1 AND status = 'active'`,
      [session_id]
    );
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    // Verify user is a member
    const member = await getOne(
      `SELECT * FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session_id, String(user.id)]
    );
    if (!member) return res.status(403).json({ error: 'You are not a member of this session' });

    // Update member location
    await run(
      `UPDATE tether_members SET last_location_lat = $1, last_location_lng = $2, last_location_updated_at = NOW() WHERE id = $3`,
      [parseFloat(lat), parseFloat(lng), member.id]
    );

    // Calculate distance from group centroid (all active members except this one)
    const others = await getMany(
      `SELECT last_location_lat, last_location_lng FROM tether_members
       WHERE session_id = $1 AND id != $2 AND status IN ('active','separated') AND last_location_lat IS NOT NULL`,
      [session_id, member.id]
    );

    let distanceFt = 0;
    if (others.length > 0) {
      // Compute centroid
      let sumLat = 0, sumLng = 0;
      for (const o of others) {
        sumLat += parseFloat(o.last_location_lat);
        sumLng += parseFloat(o.last_location_lng);
      }
      const centroidLat = sumLat / others.length;
      const centroidLng = sumLng / others.length;
      distanceFt = haversineDistanceFt(parseFloat(lat), parseFloat(lng), centroidLat, centroidLng);
    }

    const threshold = session.distance_threshold_ft || 300;
    const previousStatus = member.status;
    let newStatus = previousStatus;

    if (distanceFt > threshold && previousStatus !== 'separated') {
      // Member has separated
      newStatus = 'separated';
      await run(
        `UPDATE tether_members SET status = 'separated' WHERE id = $1`,
        [member.id]
      );
      await run(
        `INSERT INTO tether_events (session_id, user_id, event_type, metadata) VALUES ($1, $2, 'distance_warning', $3)`,
        [session_id, String(user.id), JSON.stringify({ distance_ft: Math.round(distanceFt), threshold_ft: threshold })]
      );
      await run(
        `INSERT INTO tether_events (session_id, user_id, event_type, metadata) VALUES ($1, $2, 'member_separated', $3)`,
        [session_id, String(user.id), JSON.stringify({ distance_ft: Math.round(distanceFt) })]
      );
    } else if (distanceFt <= threshold && previousStatus === 'separated') {
      // Member has returned
      newStatus = 'active';
      await run(
        `UPDATE tether_members SET status = 'active' WHERE id = $1`,
        [member.id]
      );
      await run(
        `INSERT INTO tether_events (session_id, user_id, event_type, metadata) VALUES ($1, $2, 'member_returned', $3)`,
        [session_id, String(user.id), JSON.stringify({ distance_ft: Math.round(distanceFt) })]
      );
    }

    // Return all members
    const members = await getMany(
      `SELECT id, user_id, display_name, role, status, last_location_lat, last_location_lng, last_location_updated_at
       FROM tether_members WHERE session_id = $1 AND status != 'ended' ORDER BY joined_at`,
      [session_id]
    );

    return res.status(200).json({
      success: true,
      status: newStatus,
      distance_ft: Math.round(distanceFt),
      threshold_ft: threshold,
      members
    });
  } catch (err) {
    console.error('Tether location error:', err);
    return res.status(500).json({ error: 'Failed to update location', details: err.message });
  }
};
