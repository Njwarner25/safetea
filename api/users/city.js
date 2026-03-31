const { run, getOne } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  cors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Parse request body
    const body = await parseBody(req);
    const { city } = body;

    // Validate city parameter
    if (!city || typeof city !== 'string') {
      return res.status(400).json({ error: 'Missing or invalid city parameter' });
    }

    // Verify the city exists and is active
    const cityRecord = await getOne(
      'SELECT id, slug, name FROM cities WHERE slug = $1 AND is_active = true',
      [city]
    );

    if (!cityRecord) {
      return res.status(400).json({ error: 'Invalid or inactive city' });
    }

    // Update user's city
    const result = await run(
      'UPDATE users SET city = $1 WHERE id = $2 RETURNING id, city',
      [city, user.id]
    );

    if (!result.rows.length) {
      return res.status(500).json({ error: 'Failed to update city' });
    }

    const updatedUser = result.rows[0];

    return res.status(200).json({
      success: true,
      city: updatedUser.city,
      city_name: cityRecord.name
    });
  } catch (error) {
    console.error('Error updating user city:', error);
    return res.status(500).json({ error: 'Failed to update user city' });
  }
};
