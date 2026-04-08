const { cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.query || {};
  if (!key) {
    return res.status(400).json({ error: 'Session key required' });
  }

  try {
    const session = await getOne(
      `SELECT s.*, u.display_name, u.custom_display_name
       FROM safelink_sessions s
       JOIN users u ON s.user_id = u.id
       WHERE s.session_key = $1`,
      [key]
    );

    if (!session) {
      return res.status(404).json({ error: 'SafeLink session not found' });
    }

    const trail = await getMany(
      `SELECT latitude, longitude, recorded_at
       FROM safelink_locations
       WHERE session_key = $1
       ORDER BY recorded_at ASC`,
      [key]
    );

    const displayName = session.custom_display_name || session.display_name || 'A SafeTea user';

    return res.status(200).json({
      success: true,
      session: {
        status: session.status,
        userName: displayName,
        label: session.label || null,
        latitude: session.latitude,
        longitude: session.longitude,
        contactsNotified: session.contacts_notified,
        stoppedAt: session.stopped_at,
        createdAt: session.created_at,
      },
      trail: trail.map(function(t) {
        return {
          latitude: t.latitude,
          longitude: t.longitude,
          recordedAt: t.recorded_at,
        };
      }),
    });
  } catch (err) {
    console.error('SafeLink session error:', err);
    return res.status(500).json({ error: 'Failed to fetch SafeLink session' });
  }
};
