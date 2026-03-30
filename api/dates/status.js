const { cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Public endpoint — no auth required (accessed via share code)
  const code = req.query.code || '';
  if (!code || code.length < 4) {
    return res.status(400).json({ error: 'Valid share code required' });
  }

  try {
    const checkout = await getOne(
      `SELECT dc.id, dc.date_name, dc.venue_name, dc.venue_address, dc.venue_lat, dc.venue_lng,
              dc.scheduled_time, dc.estimated_return, dc.status, dc.checked_in_at,
              dc.created_at, dc.date_photo_url,
              u.display_name as user_name
       FROM date_checkouts dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.share_code = $1`,
      [code.toUpperCase()]
    );

    if (!checkout) {
      return res.status(404).json({ error: 'Checkout not found. Invalid or expired share code.' });
    }

    // Calculate time since checkout
    const checkoutTime = new Date(checkout.created_at);
    const now = new Date();
    const minutesSince = Math.floor((now - checkoutTime) / 60000);

    // Check if overdue (past estimated return without check-in)
    let isOverdue = false;
    if (checkout.estimated_return && checkout.status !== 'checked_in') {
      const returnTime = new Date(checkout.estimated_return);
      isOverdue = now > returnTime;
    }

    return res.status(200).json({
      success: true,
      date: {
        userName: checkout.user_name,
        dateName: checkout.date_name,
        datePhotoUrl: checkout.date_photo_url,
        venueName: checkout.venue_name,
        venueAddress: checkout.venue_address,
        venueLat: checkout.venue_lat,
        venueLng: checkout.venue_lng,
        scheduledTime: checkout.scheduled_time,
        estimatedReturn: checkout.estimated_return,
        status: checkout.status,
        checkedInAt: checkout.checked_in_at,
        checkedOutAt: checkout.created_at,
        minutesSinceCheckout: minutesSince,
        isOverdue,
      },
    });
  } catch (err) {
    console.error('Date status error:', err);
    return res.status(500).json({ error: 'Failed to fetch date status' });
  }
};
