const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await authenticate(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  if (admin.role !== 'admin' && admin.role !== 'moderator') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const userId = req.query.user_id;
  if (!userId) return res.status(400).json({ error: 'user_id query param required' });

  try {
    const events = await getMany(
      `SELECT id, event_type, delta, score_before, score_after, reason, triggered_by, admin_id, created_at
       FROM trust_events
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [parseInt(userId)]
    );

    return res.status(200).json({ events });
  } catch (err) {
    console.error('[TrustEvents] Error:', err);
    return res.status(500).json({ error: 'Failed to load trust events' });
  }
};
