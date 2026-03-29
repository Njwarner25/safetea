const { authenticate, cors } = require('./_utils/auth');
const { getOne, getMany, run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET: List user's watch zones
  if (req.method === 'GET') {
    try {
      const zones = await getMany(
        'SELECT * FROM user_watch_zones WHERE user_id = $1 AND is_active = true ORDER BY created_at DESC',
        [user.id]
      );
      return res.status(200).json(zones);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch watch zones', details: err.message });
    }
  }

  // POST: Create watch zone
  if (req.method === 'POST') {
    const body = req.body || {};
    const { name, latitude, longitude, radius_miles, source } = body;

    if (!latitude || !longitude) {
      return res.status(400).json({ error: 'latitude and longitude required' });
    }

    try {
      // Max 10 watch zones per user
      const existing = await getOne(
        'SELECT COUNT(*)::int AS count FROM user_watch_zones WHERE user_id = $1',
        [user.id]
      );
      if (existing && existing.count >= 10) {
        return res.status(400).json({ error: 'Maximum 10 watch zones allowed' });
      }

      const zone = await getOne(
        `INSERT INTO user_watch_zones (user_id, name, latitude, longitude, radius_miles, source)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [user.id, name || 'Watch Zone', parseFloat(latitude), parseFloat(longitude), parseFloat(radius_miles) || 0.5, source || 'manual']
      );

      return res.status(201).json(zone);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create watch zone', details: err.message });
    }
  }

  // DELETE: Remove watch zone
  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Watch zone ID required (?id=)' });

    try {
      await run(
        'DELETE FROM user_watch_zones WHERE id = $1 AND user_id = $2',
        [id, user.id]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete watch zone', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
