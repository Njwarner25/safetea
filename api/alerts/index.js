const { getMany, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
          if (req.method === 'GET') {
                  const { city, type, severity, active = 'true' } = req.query;
                  let where = ['a.active = $1'];
                  let params = [active === 'true'];
                  let idx = 2;

            if (city) { where.push(`a.city = $${idx++}`); params.push(city); }
                  if (type) { where.push(`a.type = $${idx++}`); params.push(type); }
                  if (severity) { where.push(`a.severity = $${idx++}`); params.push(severity); }

            const alerts = await getMany(
                      `SELECT a.*, u.display_name as author_name
                               FROM alerts a JOIN users u ON a.user_id = u.id
                                        WHERE ${where.join(' AND ')}
                                                 ORDER BY a.created_at DESC LIMIT 50`,
                      params
                    );

            return res.status(200).json({ alerts });
          }

      if (req.method === 'POST') {
              const user = await authenticate(req);
              if (!user) return res.status(401).json({ error: 'Not authenticated' });
              if (user.role !== 'admin' && user.role !== 'moderator') {
                        return res.status(403).json({ error: 'Only admins and moderators can create alerts' });
              }

            const { title, description, type, severity, city, lat, lng } = req.body;
              if (!title) return res.status(400).json({ error: 'Title is required' });

            await run(
                      'INSERT INTO alerts (user_id, title, description, type, severity, city, lat, lng) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
                      [user.id, title, description || '', type || 'general', severity || 'low', city || user.city, lat || null, lng || null]
                    );

            return res.status(201).json({ message: 'Alert created' });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
          console.error('Alerts error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
