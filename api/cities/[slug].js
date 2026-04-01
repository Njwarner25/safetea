const { cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Extract slug from URL path
    const urlParts = req.url.split('?')[0].split('/');
    const slug = urlParts[urlParts.length - 1];

    if (!slug) {
      return res.status(400).json({ error: 'Slug is required' });
    }

    // First check active cities table
    const activeCity = await getOne(
      'SELECT * FROM cities WHERE LOWER(REPLACE(name, \' \', \'-\')) = $1 AND is_active = true',
      [slug.toLowerCase()]
    );
    if (activeCity) {
      return res.status(200).json({ active: true, city: activeCity });
    }

    // Then check city_requests
    const cityRequest = await getOne(
      'SELECT * FROM city_requests WHERE slug = $1',
      [slug.toLowerCase()]
    );
    if (!cityRequest) {
      return res.status(404).json({ error: 'City not found' });
    }

    // Get recent signup avatars for social proof
    const recentSignups = await getMany(
      `SELECT u.display_name, u.avatar_url
       FROM city_signups cs
       LEFT JOIN users u ON cs.user_id = u.id
       WHERE cs.city_request_id = $1 AND u.id IS NOT NULL
       ORDER BY cs.created_at DESC
       LIMIT 20`,
      [cityRequest.id]
    );

    return res.status(200).json({
      active: false,
      request: {
        id: cityRequest.id,
        city_name: cityRequest.city_name,
        state: cityRequest.state,
        slug: cityRequest.slug,
        emoji: cityRequest.emoji,
        signup_count: cityRequest.signup_count,
        threshold: cityRequest.threshold,
        status: cityRequest.status,
        progress: Math.round((cityRequest.signup_count / cityRequest.threshold) * 100),
        created_at: cityRequest.created_at
      },
      recentSignups
    });
  } catch (err) {
    console.error('City slug lookup error:', err);
    return res.status(500).json({ error: 'Failed to load city data' });
  }
};
