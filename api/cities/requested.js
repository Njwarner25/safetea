const { cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cityRequests = await getMany(
      `SELECT id, city_name, state, slug, emoji, signup_count, threshold, status, created_at
       FROM city_requests
       ORDER BY signup_count DESC`
    );

    return res.status(200).json({ cityRequests });
  } catch (err) {
    console.error('City requested list error:', err);
    return res.status(500).json({ error: 'Failed to load requested cities' });
  }
};
