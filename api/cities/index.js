const { getMany } = require('../_utils/db');
const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const cities = await getMany(
      'SELECT id, name, slug, emoji, image_url, post_count, user_count FROM cities WHERE is_active = true ORDER BY name',
      []
    );

    return res.status(200).json(cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    return res.status(500).json({ error: 'Failed to fetch cities' });
  }
};
