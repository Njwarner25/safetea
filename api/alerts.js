const { cors } = require('./_utils/auth');
const { getMany } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const city = req.query.city || '';

  try {
    let alerts;
    if (city) {
      alerts = await getMany(
        `SELECT id, title, description, type, severity, city, lat, lng, created_at
         FROM alerts WHERE active = true AND (city ILIKE $1 OR city IS NULL)
         ORDER BY created_at DESC LIMIT 20`,
        ['%' + city + '%']
      );
    } else {
      alerts = await getMany(
        `SELECT id, title, description, type, severity, city, lat, lng, created_at
         FROM alerts WHERE active = true
         ORDER BY created_at DESC LIMIT 20`
      );
    }

    return res.status(200).json({ alerts });
  } catch (err) {
    return res.status(200).json({ alerts: [] });
  }
};
