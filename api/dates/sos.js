const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ========== POST: Create SOS event (authenticated) ==========
  if (req.method === 'POST') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Paid tier check (accept 'plus', 'pro', or 'premium' for backwards compat)
    if (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
      return res.status(403).json({ error: 'SOS feature requires SafeTea+ ($7.99/mo)' });
    }

    const body = await parseBody(req);
    const { type, latitude, longitude } = body;

    if (!type || !['alert_contacts', 'fake_call', 'call_911'].includes(type)) {
      return res.status(400).json({ error: 'Invalid SOS type. Must be: alert_contacts, fake_call, or call_911' });
    }

    try {
      // Find the user's active checkout
      const activeCheckout = await getOne(
        `SELECT * FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );

      if (!activeCheckout) {
        return res.status(400).json({ error: 'No active date checkout found. Start a SafeWalk first.' });
      }

      // Ensure sos_events table exists
      await run(`CREATE TABLE IF NOT EXISTS sos_events (
        id SERIAL PRIMARY KEY,
        checkout_id INTEGER REFERENCES date_checkouts(id),
        user_id INTEGER REFERENCES users(id),
        type VARCHAR(50) NOT NULL,
        latitude DECIMAL(10,8),
        longitude DECIMAL(11,8),
        resolved_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`);

      // Insert SOS event
      const sosEvent = await getOne(
        `INSERT INTO sos_events (checkout_id, user_id, type, latitude, longitude)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [activeCheckout.id, user.id, type, latitude || null, longitude || null]
      );

      let contactsNotified = 0;

      // If alert_contacts, send SMS to trusted contacts
      if (type === 'alert_contacts') {
        const contacts = await getMany(
          `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
          [activeCheckout.id]
        );

        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
          const twilio = require('twilio')(twilioSid, twilioAuth);

          const gpsLink = latitude && longitude
            ? `https://maps.google.com/?q=${latitude},${longitude}`
            : null;
          const trackingUrl = `https://www.getsafetea.app/date-status?code=${activeCheckout.share_code}`;

          const message =
            `🚨 SOS ALERT — SafeTea\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `${user.display_name || 'A SafeTea user'} triggered an emergency SOS alert.\n\n` +
            `Date with: ${activeCheckout.date_name}\n` +
            `Venue: ${activeCheckout.venue_name}\n` +
            (activeCheckout.venue_address ? `Address: ${activeCheckout.venue_address}\n` : '') +
            (gpsLink ? `\nGPS Location: ${gpsLink}\n` : '') +
            `\nLive tracking: ${trackingUrl}\n` +
            `\nPlease check on them immediately.\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `Sent via SafeTea SOS`;

          for (const contact of contacts) {
            try {
              await twilio.messages.create({
                body: message,
                from: twilioPhone,
                to: contact.contact_phone,
              });
              contactsNotified++;
            } catch (smsErr) {
              console.error(`SOS SMS failed to ${contact.contact_phone}:`, smsErr.message);
            }
          }
        }
      }

      return res.status(201).json({
        success: true,
        sosId: sosEvent.id,
        type,
        contactsNotified,
        checkoutId: activeCheckout.id,
        shareCode: activeCheckout.share_code,
      });
    } catch (err) {
      console.error('SOS error:', err);
      return res.status(500).json({ error: 'Failed to create SOS event', details: err.message });
    }
  }

  // ========== GET: Get SOS status by share code (public) ==========
  if (req.method === 'GET') {
    const { code } = req.query || {};
    if (!code) {
      return res.status(400).json({ error: 'Share code required' });
    }

    try {
      const sosEvent = await getOne(
        `SELECT se.*, dc.share_code, dc.date_name, dc.venue_name, dc.venue_address,
                u.display_name as user_name
         FROM sos_events se
         JOIN date_checkouts dc ON se.checkout_id = dc.id
         JOIN users u ON se.user_id = u.id
         WHERE dc.share_code = $1
         ORDER BY se.created_at DESC
         LIMIT 1`,
        [code]
      );

      if (!sosEvent) {
        return res.status(200).json({ success: true, sos: null });
      }

      return res.status(200).json({
        success: true,
        sos: {
          id: sosEvent.id,
          type: sosEvent.type,
          latitude: sosEvent.latitude,
          longitude: sosEvent.longitude,
          createdAt: sosEvent.created_at,
          resolvedAt: sosEvent.resolved_at,
          userName: sosEvent.user_name,
          dateName: sosEvent.date_name,
          venueName: sosEvent.venue_name,
        },
      });
    } catch (err) {
      console.error('SOS status error:', err);
      return res.status(500).json({ error: 'Failed to fetch SOS status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
