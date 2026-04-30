const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const sessionId = url.searchParams.get('session_id');

    if (!sessionId) return res.status(400).json({ error: 'session_id query param is required' });

    // Verify membership
    const member = await getOne(
      `SELECT id FROM tether_members WHERE session_id = $1 AND user_id = $2`,
      [sessionId, String(user.id)]
    );
    if (!member) return res.status(403).json({ error: 'You are not a member of this session' });

    // Fetch session
    const session = await getOne(
      `SELECT * FROM tether_sessions WHERE id = $1`,
      [sessionId]
    );
    if (!session) return res.status(404).json({ error: 'Session not found' });

    // Fetch members
    const members = await getMany(
      `SELECT id, user_id, display_name, role, status, joined_at, last_location_lat, last_location_lng, last_location_updated_at, last_ping_at, last_response, removed_at
       FROM tether_members WHERE session_id = $1 ORDER BY joined_at`,
      [sessionId]
    );

    // Fetch recent events
    const events = await getMany(
      `SELECT id, user_id, event_type, metadata, created_at
       FROM tether_events WHERE session_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [sessionId]
    );

    return res.status(200).json({
      success: true,
      session,
      members,
      events
    });
  } catch (err) {
    console.error('Tether status error:', err);
    return res.status(500).json({ error: 'Failed to fetch session status', details: err.message });
  }
};
