const { getMany } = require('../_utils/db');
const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(res);
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const cities = await getMany(
      'SELECT id, name, slug, emoji, image_url, post_count, user_count FROM cities WHERE is_active = true ORDER BY name',
      []
    );

    return cors(res, 200, cities);
  } catch (error) {
    console.error('Error fetching cities:', error);
    return cors(res, 500, { error: 'Failed to fetch cities' });
  }
};
