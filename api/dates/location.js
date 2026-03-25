const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ========== POST: User updates their live location ==========
  if (req.method === 'POST') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = await parseBody(req);
    const { checkoutId, lat, lng, accuracy } = body;

    if (!checkoutId || !lat || !lng) {
      return res.status(400).json({ error: 'Missing required fields: checkoutId, lat, lng' });
    }

    // Verify this checkout belongs to the user and is active
    const checkout = await getOne(
      `SELECT id, status FROM date_checkouts WHERE id = $1 AND user_id = $2`,
      [checkoutId, user.id]
    );

    if (!checkout) {
      return res.status(404).json({ error: 'Checkout not found or not yours' });
    }

    if (checkout.status === 'checked_in' || checkout.status === 'cancelled') {
      return res.status(400).json({ error: 'Checkout is no longer active' });
    }

    try {
      // Upsert location — one row per checkout, always latest
      await run(
        `INSERT INTO date_locations (checkout_id, lat, lng, accuracy, updated_at)
         VALUES ($1, $2, $3, $4, NOW())
         ON CONFLICT (checkout_id)
         DO UPDATE SET lat = $2, lng = $3, accuracy = $4, updated_at = NOW()`,
        [checkoutId, lat, lng, accuracy || null]
      );

      return res.status(200).json({ success: true, message: 'Location updated' });
    } catch (err) {
      console.error('Location update error:', err);
      return res.status(500).json({ error: 'Failed to update location' });
    }
  }

  // ========== GET: Trusted contact fetches user's live location ==========
  if (req.method === 'GET') {
    const code = req.query.code || '';
    if (!code || code.length < 4) {
      return res.status(400).json({ error: 'Valid share code required' });
    }

    try {
      const checkout = await getOne(
        `SELECT dc.id FROM date_checkouts dc WHERE dc.share_code = $1`,
        [code.toUpperCase()]
      );

      if (!checkout) {
        return res.status(404).json({ error: 'Checkout not found' });
      }

      const location = await getOne(
        `SELECT lat, lng, accuracy, updated_at
         FROM date_locations
         WHERE checkout_id = $1`,
        [checkout.id]
      );

      if (!location) {
        return res.status(200).json({ success: true, location: null, message: 'No location shared yet' });
      }

      return res.status(200).json({
        success: true,
        location: {
          lat: parseFloat(location.lat),
          lng: parseFloat(location.lng),
          accuracy: location.accuracy ? parseInt(location.accuracy) : null,
          updatedAt: location.updated_at,
        },
      });
    } catch (err) {
      console.error('Location fetch error:', err);
      return res.status(500).json({ error: 'Failed to fetch location' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
