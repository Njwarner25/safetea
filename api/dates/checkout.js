const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ========== POST: Create a date check-out ==========
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      dateName,           // Name of the person they're meeting
      datePhotoUrl,       // Photo of the date (URL or base64)
      venueName,          // Where they're meeting
      venueAddress,       // Full address
      venueLat,           // Latitude (optional)
      venueLng,           // Longitude (optional)
      transportation,     // How they're getting there
      transportDetails,   // Additional transport info (license plate, ride details)
      scheduledTime,      // When the date starts (ISO string)
      estimatedReturn,    // When they expect to be back (ISO string, optional)
      notes,              // Any extra notes
      trustedContacts,    // Array of { name, phone } for SMS sharing
    } = body;

    // Validation
    if (!dateName || !venueName || !scheduledTime) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['dateName', 'venueName', 'scheduledTime'],
      });
    }

    // SECURITY: Use crypto.randomBytes for unpredictable share codes (12 chars)
    const crypto = require('crypto');
    const shareCode = crypto.randomBytes(9).toString('base64url').substring(0, 12).toUpperCase();

    try {
      const checkout = await getOne(
        `INSERT INTO date_checkouts
         (user_id, date_name, date_photo_url, venue_name, venue_address, venue_lat, venue_lng,
          transportation, transport_details, scheduled_time, estimated_return, notes, share_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'checked_out')
         RETURNING *`,
        [
          user.id, dateName, datePhotoUrl || null, venueName, venueAddress || null,
          venueLat || null, venueLng || null,
          transportation || null, transportDetails || null,
          scheduledTime, estimatedReturn || null, notes || null, shareCode,
        ]
      );

      // Save trusted contacts
      const savedContacts = [];
      if (trustedContacts && Array.isArray(trustedContacts)) {
        for (const contact of trustedContacts.slice(0, 5)) { // Max 5 contacts
          if (contact.name && contact.phone) {
            const saved = await getOne(
              `INSERT INTO date_trusted_contacts (checkout_id, contact_name, contact_phone, notified)
               VALUES ($1, $2, $3, false)
               RETURNING *`,
              [checkout.id, contact.name, contact.phone]
            );
            savedContacts.push(saved);
          }
        }
      }

      // Build the SafeTea Report data
      const transportLabels = {
        driving: 'Driving myself',
        rideshare: 'Rideshare (Uber/Lyft)',
        public_transit: 'Public transit',
        walking: 'Walking',
        biking: 'Biking',
        taxi: 'Taxi',
        friend_drop: 'Friend dropping me off',
        other: 'Other',
      };

      const report = {
        reportId: checkout.id,
        shareCode,
        userName: user.display_name || 'SafeTea User',
        dateName,
        datePhotoUrl: datePhotoUrl || null,
        venue: venueName,
        address: venueAddress || null,
        transportation: transportLabels[transportation] || transportation || 'Not specified',
        transportDetails: transportDetails || null,
        scheduledTime,
        estimatedReturn: estimatedReturn || null,
        notes: notes || null,
        status: 'checked_out',
        createdAt: checkout.created_at,
        trackingUrl: `https://www.getsafetea.app/date-status?code=${shareCode}`,
        contactsNotified: savedContacts.length,
      };

      // Build pre-formatted share message (user sends via native share / SMS)
      const dateTime = new Date(scheduledTime).toLocaleString('en-US', { timeZone: 'America/Chicago' });
      const transportLine = transportation ? `Getting there: ${transportLabels[transportation] || transportation}${transportDetails ? ' (' + transportDetails + ')' : ''}` : '';

      const shareMessage =
        `SafeTea Report\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `${user.display_name || 'A SafeTea user'} is going on a date.\n\n` +
        `Meeting: ${dateName}\n` +
        `Where: ${venueName}${venueAddress ? '\nAddress: ' + venueAddress : ''}\n` +
        `When: ${dateTime}\n` +
        `${transportLine ? transportLine + '\n' : ''}` +
        `${estimatedReturn ? 'Expected back: ' + new Date(estimatedReturn).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + '\n' : ''}` +
        `${notes ? 'Notes: ' + notes + '\n' : ''}` +
        `\nTrack live: ${report.trackingUrl}\n` +
        `\nIf they don't check in, please reach out.\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `Sent via SafeTea`;

      return res.status(201).json({
        success: true,
        checkout: {
          id: checkout.id,
          shareCode,
          dateName,
          datePhotoUrl: datePhotoUrl || null,
          venueName,
          venueAddress,
          transportation: transportation || null,
          transportDetails: transportDetails || null,
          scheduledTime,
          estimatedReturn,
          status: 'checked_out',
          trustedContacts: savedContacts.length,
          createdAt: checkout.created_at,
        },
        report,
        shareUrl: report.trackingUrl,
        shareMessage,
        contacts: savedContacts.map(c => ({
          name: c.contact_name,
          phone: c.contact_phone,
        })),
      });
    } catch (err) {
      console.error('Checkout error:', err);
      return res.status(500).json({ error: 'Failed to create checkout', details: 'See server logs' });
    }
  }

  // ========== GET: List user's checkouts ==========
  if (req.method === 'GET') {
    try {
      const checkouts = await getMany(
        `SELECT dc.*,
          (SELECT COUNT(*) FROM date_trusted_contacts WHERE checkout_id = dc.id) as contact_count
         FROM date_checkouts dc
         WHERE dc.user_id = $1
         ORDER BY dc.created_at DESC
         LIMIT 20`,
        [user.id]
      );
      return res.status(200).json({ success: true, checkouts });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch checkouts', details: 'See server logs' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
