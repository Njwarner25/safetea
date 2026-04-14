const { authenticate, cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const MAX_SESSION_HOURS = 12;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    // Auto-expire sessions older than MAX_SESSION_HOURS
    await run(
      `UPDATE safelink_sessions SET status = 'expired', stopped_at = NOW()
       WHERE user_id = $1 AND status = 'active'
       AND created_at < NOW() - INTERVAL '${MAX_SESSION_HOURS} hours'`,
      [user.id]
    );

    // Get remaining active session (should be at most 1)
    const session = await getOne(
      `SELECT session_key, label, latitude, longitude, contacts_notified,
              is_public, created_at, stopped_at, status
       FROM safelink_sessions
       WHERE user_id = $1 AND status = 'active'
       ORDER BY created_at DESC
       LIMIT 1`,
      [user.id]
    );

    if (!session) {
      return res.status(200).json({ success: true, session: null });
    }

    const domain = 'https://www.getsafetea.app';
    return res.status(200).json({
      success: true,
      session: {
        sessionKey: session.session_key,
        label: session.label,
        latitude: session.latitude,
        longitude: session.longitude,
        contactsNotified: session.contacts_notified || 0,
        isPublic: !!session.is_public,
        trackingUrl: domain + '/safelink-live.html?key=' + session.session_key,
        createdAt: session.created_at,
        status: session.status
      }
    });
  } catch (err) {
    console.error('SafeLink active error:', err);
    return res.status(500).json({ error: 'Failed to check active session' });
  }
};
