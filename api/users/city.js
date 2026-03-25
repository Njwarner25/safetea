const { run, getOne } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return cors(res);
  }

  if (req.method !== 'PUT') {
    res.setHeader('Allow', 'PUT, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Authenticate user
    const user = await authenticate(req);
    if (!user) {
      return cors(res, 401, { error: 'Unauthorized' });
    }

    // Parse request body
    const body = await parseBody(req);
    const { city } = body;

    // Validate city parameter
    if (!city || typeof city !== 'string') {
      return cors(res, 400, { error: 'Missing or invalid city parameter' });
    }

    // Verify the city exists and is active
    const cityRecord = await getOne(
      'SELECT id, slug, name FROM cities WHERE slug = $1 AND is_active = true',
      [city]
    );

    if (!cityRecord) {
      return cors(res, 400, { error: 'Invalid or inactive city' });
    }

    // Update user's city
    const result = await run(
      'UPDATE users SET city = $1 WHERE id = $2 RETURNING id, city',
      [city, user.id]
    );

    if (!result.rows.length) {
      return cors(res, 500, { error: 'Failed to update city' });
    }

    const updatedUser = result.rows[0];

    return cors(res, 200, {
      success: true,
      city: updatedUser.city,
      city_name: cityRecord.name
    });
  } catch (error) {
    console.error('Error updating user city:', error);
    return cors(res, 500, { error: 'Failed to update user city' });
  }
};
