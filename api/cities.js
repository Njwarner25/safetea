const { cors } = require('./_utils/auth');
const { getMany } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cities = await getMany(
      `SELECT id, city, state, votes FROM city_votes ORDER BY votes DESC LIMIT 50`
    );

    return res.status(200).json({ cities });
  } catch (err) {
    return res.status(200).json({ cities: [] });
  }
};
