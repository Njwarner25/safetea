const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, query: queryValidator, validationResult } = require('express-validator');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { query, getOne, getAll } = require('../db/database');

const router = express.Router();

// ============================================================================
// POST /api/dates - Create a date checkout
// ============================================================================
router.post(
  '/',
  authenticate,
  [
    body('dateName').trim().notEmpty().withMessage('Date name is required'),
    body('venueName').trim().notEmpty().withMessage('Venue name is required'),
    body('venueAddress').optional().trim(),
    body('venueLat').optional().isFloat(),
    body('venueLng').optional().isFloat(),
    body('datePhotoUrl').optional().trim(),
    body('transportation').optional().trim(),
    body('transportDetails').optional().trim(),
    body('scheduledTime').trim().notEmpty().withMessage('Scheduled time is required'),
    body('estimatedReturn').optional().trim(),
    body('notes').optional().trim(),
    body('trustedContacts').optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const {
      dateName,
      datePhotoUrl,
      venueName,
      venueAddress,
      venueLat,
      venueLng,
      transportation,
      transportDetails,
      scheduledTime,
      estimatedReturn,
      notes,
      trustedContacts,
    } = req.body;

    const userId = req.user.id;

    try {
      // Generate a unique share code (6 chars, alphanumeric)
      const shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();

      // Insert date checkout
      const checkout = await getOne(
        `INSERT INTO date_checkouts
         (user_id, date_name, date_photo_url, venue_name, venue_address, venue_lat, venue_lng,
          transportation, transport_details, scheduled_time, estimated_return, notes, share_code, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, 'checked_out')
         RETURNING *`,
        [
          userId,
          dateName,
          datePhotoUrl || null,
          venueName,
          venueAddress || null,
          venueLat || null,
          venueLng || null,
          transportation || null,
          transportDetails || null,
          scheduledTime,
          estimatedReturn || null,
          notes || null,
          shareCode,
        ]
      );

      // Save trusted contacts
      const savedContacts = [];
      if (trustedContacts && Array.isArray(trustedContacts)) {
        for (const contact of trustedContacts.slice(0, 5)) {
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
        userName: req.user.display_name || 'SafeTea User',
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

      // Send SMS to trusted contacts with SafeTea Report summary
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioAuth && twilioPhone && savedContacts.length > 0) {
        try {
          const twilio = require('twilio')(twilioSid, twilioAuth);
          const dateTime = new Date(scheduledTime).toLocaleString('en-US', {
            timeZone: 'America/Chicago',
          });
          const transportLine = transportation
            ? `Getting there: ${transportLabels[transportation] || transportation}${
                transportDetails ? ' (' + transportDetails + ')' : ''
              }`
            : '';

          const message =
            `SafeTea Report\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `${req.user.display_name || 'A SafeTea user'} is going on a date.\n\n` +
            `Meeting: ${dateName}\n` +
            `Where: ${venueName}${venueAddress ? '\nAddress: ' + venueAddress : ''}\n` +
            `When: ${dateTime}\n` +
            `${transportLine ? transportLine + '\n' : ''}` +
            `${estimatedReturn ? 'Expected back: ' + new Date(estimatedReturn).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + '\n' : ''}` +
            `${notes ? 'Notes: ' + notes + '\n' : ''}` +
            `\nTrack live: ${report.trackingUrl}\n` +
            `\nIf they don't check in, you'll be notified.\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `Sent via SafeTea`;

          for (const contact of savedContacts) {
            try {
              await twilio.messages.create({
                body: message,
                from: twilioPhone,
                to: contact.contact_phone,
              });
              await query(
                'UPDATE date_trusted_contacts SET notified = true WHERE id = $1',
                [contact.id]
              );
            } catch (smsErr) {
              console.error(`SMS failed to ${contact.contact_phone}:`, smsErr.message);
            }
          }
        } catch (twilioErr) {
          console.error('Twilio initialization failed:', twilioErr.message);
        }
      }

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
        shareUrl: `https://www.getsafetea.app/date-status?code=${shareCode}`,
        smsMessage:
          savedContacts.length > 0
            ? `SafeTea Report sent to ${savedContacts.length} trusted contact(s) via SMS`
            : 'No trusted contacts provided (SMS not sent)',
      });
    } catch (err) {
      console.error('Checkout error:', err);
      return res.status(500).json({ error: 'Failed to create checkout', details: err.message });
    }
  }
);

// ============================================================================
// GET /api/dates - List user's checkouts
// ============================================================================
router.get('/', authenticate, async (req, res) => {
  try {
    const checkouts = await getAll(
      `SELECT dc.*,
        (SELECT COUNT(*) FROM date_trusted_contacts WHERE checkout_id = dc.id) as contact_count
       FROM date_checkouts dc
       WHERE dc.user_id = $1
       ORDER BY dc.created_at DESC
       LIMIT 20`,
      [req.user.id]
    );
    return res.status(200).json({ success: true, checkouts });
  } catch (err) {
    return res.status(500).json({ error: 'Failed to fetch checkouts', details: err.message });
  }
});

// ============================================================================
// POST /api/dates/checkin - Check in from a date
// ============================================================================
router.post(
  '/checkin',
  authenticate,
  [
    body('checkoutId').trim().notEmpty().withMessage('Checkout ID is required'),
    body('safetyRating').optional().isInt({ min: 1, max: 5 }),
    body('notes').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { checkoutId, safetyRating, notes } = req.body;
    const userId = req.user.id;

    try {
      // Verify the checkout belongs to this user and is still active
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, userId]
      );

      if (!checkout) {
        return res.status(404).json({ error: 'Checkout not found' });
      }

      if (checkout.status === 'checked_in') {
        return res.status(400).json({ error: 'Already checked in' });
      }

      // Update checkout status
      const updated = await getOne(
        `UPDATE date_checkouts
         SET status = 'checked_in',
             checked_in_at = NOW(),
             safety_rating = $1,
             checkin_notes = $2
         WHERE id = $3
         RETURNING *`,
        [safetyRating || null, notes || null, checkoutId]
      );

      // Notify trusted contacts that user checked in safely
      const contacts = await getAll(
        'SELECT * FROM date_trusted_contacts WHERE checkout_id = $1',
        [checkoutId]
      );

      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
        try {
          const twilio = require('twilio')(twilioSid, twilioAuth);
          const message = `SafeTea Update: ${req.user.display_name || 'Your contact'} has checked in safely from their date with ${checkout.date_name}. ✅\n\nThey made it home safe.`;

          for (const contact of contacts) {
            try {
              await twilio.messages.create({
                body: message,
                from: twilioPhone,
                to: contact.contact_phone,
              });
            } catch (smsErr) {
              console.error(`Check-in SMS failed to ${contact.contact_phone}:`, smsErr.message);
            }
          }
        } catch (twilioErr) {
          console.error('Twilio initialization failed:', twilioErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        message: 'Checked in safely!',
        checkout: {
          id: updated.id,
          dateName: updated.date_name,
          venueName: updated.venue_name,
          status: 'checked_in',
          checkedInAt: updated.checked_in_at,
          safetyRating: updated.safety_rating,
          contactsNotified: contacts.length,
        },
        contacts: contacts.map((c) => ({ name: c.contact_name, phone: c.contact_phone })),
      });
    } catch (err) {
      console.error('Checkin error:', err);
      return res.status(500).json({ error: 'Failed to check in', details: err.message });
    }
  }
);

// ============================================================================
// POST /api/dates/share - Share date info via SMS to contacts
// ============================================================================
router.post(
  '/share',
  authenticate,
  [
    body('checkoutId').trim().notEmpty().withMessage('Checkout ID is required'),
    body('contacts').optional().isArray(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { checkoutId, contacts } = req.body;
    const userId = req.user.id;

    try {
      // Verify checkout belongs to this user
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, userId]
      );

      if (!checkout) {
        return res.status(404).json({ error: 'Checkout not found' });
      }

      // Build the share summary
      const summary = buildShareSummary(checkout, req.user);

      // Send SMS to new contacts
      const twilioSid = process.env.TWILIO_ACCOUNT_SID;
      const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
      const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

      let smsSent = 0;

      if (twilioSid && twilioAuth && twilioPhone && contacts && contacts.length > 0) {
        try {
          const twilio = require('twilio')(twilioSid, twilioAuth);

          for (const contact of contacts.slice(0, 5)) {
            if (!contact.phone) continue;

            try {
              // Save as trusted contact
              await query(
                `INSERT INTO date_trusted_contacts (checkout_id, contact_name, contact_phone, notified)
                 VALUES ($1, $2, $3, true)
                 ON CONFLICT DO NOTHING`,
                [checkoutId, contact.name || 'Contact', contact.phone]
              );

              await twilio.messages.create({
                body: summary.smsText,
                from: twilioPhone,
                to: contact.phone,
              });
              smsSent++;
            } catch (err) {
              console.error(`Share SMS failed to ${contact.phone}:`, err.message);
            }
          }
        } catch (twilioErr) {
          console.error('Twilio initialization failed:', twilioErr.message);
        }
      }

      return res.status(200).json({
        success: true,
        summary: summary.formatted,
        shareUrl: `https://www.getsafetea.app/date-status?code=${checkout.share_code}`,
        smsText: summary.smsText,
        smsSent,
      });
    } catch (err) {
      console.error('Share error:', err);
      return res.status(500).json({ error: 'Failed to share', details: err.message });
    }
  }
);

// ============================================================================
// GET /api/dates/report - Get date report details
// ============================================================================
router.get(
  '/report',
  authenticate,
  queryValidator('id').trim().notEmpty().withMessage('Checkout ID required'),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { id: checkoutId } = req.query;
    const userId = req.user.id;

    try {
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, userId]
      );
      if (!checkout) return res.status(404).json({ error: 'Checkout not found' });

      const contacts = await getAll(
        'SELECT contact_name, notified FROM date_trusted_contacts WHERE checkout_id = $1',
        [checkoutId]
      );

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

      return res.status(200).json({
        success: true,
        report: {
          reportId: checkout.id,
          shareCode: checkout.share_code,
          userName: req.user.display_name || 'SafeTea User',
          dateName: checkout.date_name,
          datePhotoUrl: checkout.date_photo_url,
          venue: checkout.venue_name,
          address: checkout.venue_address,
          transportation:
            transportLabels[checkout.transportation] || checkout.transportation || 'Not specified',
          transportDetails: checkout.transport_details,
          scheduledTime: checkout.scheduled_time,
          estimatedReturn: checkout.estimated_return,
          notes: checkout.notes,
          status: checkout.status,
          checkedInAt: checkout.checked_in_at,
          safetyRating: checkout.safety_rating,
          createdAt: checkout.created_at,
          trackingUrl: `https://www.getsafetea.app/date-status?code=${checkout.share_code}`,
          contacts: contacts.map((c) => ({ name: c.contact_name, notified: c.notified })),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch report', details: err.message });
    }
  }
);

// ============================================================================
// POST /api/dates/report - Share SafeTea Report via SMS or Inbox
// ============================================================================
router.post(
  '/report',
  authenticate,
  [
    body('checkoutId').trim().notEmpty().withMessage('Checkout ID is required'),
    body('shareMethod').isIn(['sms', 'inbox']).withMessage("shareMethod must be 'sms' or 'inbox'"),
    body('recipientPhone').optional().trim(),
    body('recipientUserId').optional().trim(),
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { checkoutId, shareMethod, recipientPhone, recipientUserId } = req.body;
    const userId = req.user.id;

    try {
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, userId]
      );
      if (!checkout) return res.status(404).json({ error: 'Checkout not found' });

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

      // ---- SHARE VIA SMS ----
      if (shareMethod === 'sms') {
        if (!recipientPhone) {
          return res.status(400).json({ error: 'recipientPhone required for SMS sharing' });
        }

        const twilioSid = process.env.TWILIO_ACCOUNT_SID;
        const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
        const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

        if (!twilioSid || !twilioAuth || !twilioPhone) {
          return res.status(500).json({ error: 'SMS service not configured' });
        }

        try {
          const twilio = require('twilio')(twilioSid, twilioAuth);
          const dateTime = new Date(checkout.scheduled_time).toLocaleString('en-US', {
            timeZone: 'America/Chicago',
          });
          const transport =
            transportLabels[checkout.transportation] || checkout.transportation || '';

          const message =
            `SafeTea Report\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `${req.user.display_name || 'A SafeTea user'} shared their date details with you.\n\n` +
            `Meeting: ${checkout.date_name}\n` +
            `Where: ${checkout.venue_name}${checkout.venue_address ? '\nAddress: ' + checkout.venue_address : ''}\n` +
            `When: ${dateTime}\n` +
            `${transport ? 'Getting there: ' + transport + (checkout.transport_details ? ' (' + checkout.transport_details + ')' : '') + '\n' : ''}` +
            `${checkout.estimated_return ? 'Expected back: ' + new Date(checkout.estimated_return).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + '\n' : ''}` +
            `\nTrack live: https://www.getsafetea.app/date-status?code=${checkout.share_code}\n` +
            `━━━━━━━━━━━━━━━━━\n` +
            `Sent via SafeTea`;

          await twilio.messages.create({
            body: message,
            from: twilioPhone,
            to: recipientPhone,
          });

          // Also save as trusted contact
          await query(
            `INSERT INTO date_trusted_contacts (checkout_id, contact_name, contact_phone, notified)
             VALUES ($1, 'Shared Contact', $2, true)
             ON CONFLICT DO NOTHING`,
            [checkoutId, recipientPhone]
          );

          return res.status(200).json({
            success: true,
            message: 'SafeTea Report sent via SMS',
            method: 'sms',
            sentTo: recipientPhone,
          });
        } catch (twilioErr) {
          console.error('Twilio error:', twilioErr.message);
          return res.status(500).json({ error: 'Failed to send SMS', details: twilioErr.message });
        }
      }

      // ---- SHARE VIA INBOX ----
      if (shareMethod === 'inbox') {
        if (!recipientUserId) {
          return res.status(400).json({ error: 'recipientUserId required for inbox sharing' });
        }

        // Verify recipient exists
        const recipient = await getOne('SELECT id, display_name FROM users WHERE id = $1', [
          recipientUserId,
        ]);
        if (!recipient) {
          return res.status(404).json({ error: 'Recipient user not found' });
        }

        const dateTime = new Date(checkout.scheduled_time).toLocaleString('en-US', {
          timeZone: 'America/Chicago',
        });
        const transport =
          transportLabels[checkout.transportation] || checkout.transportation || '';

        const reportMessage =
          `SafeTea Report\n` +
          `━━━━━━━━━━━━━━━\n` +
          `I'm heading out on a date! Here are the details:\n\n` +
          `Meeting: ${checkout.date_name}\n` +
          `Where: ${checkout.venue_name}${checkout.venue_address ? ' (' + checkout.venue_address + ')' : ''}\n` +
          `When: ${dateTime}\n` +
          `${transport ? 'Getting there: ' + transport + (checkout.transport_details ? ' - ' + checkout.transport_details : '') + '\n' : ''}` +
          `${checkout.estimated_return ? 'Expected back: ' + new Date(checkout.estimated_return).toLocaleString('en-US', { timeZone: 'America/Chicago' }) + '\n' : ''}` +
          `\nTrack my status: https://www.getsafetea.app/date-status?code=${checkout.share_code}`;

        // Insert into messages table (uses existing inbox system)
        await query(
          `INSERT INTO messages (sender_id, recipient_id, content, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [userId, recipientUserId, reportMessage]
        );

        return res.status(200).json({
          success: true,
          message: `SafeTea Report sent to ${recipient.display_name}'s inbox`,
          method: 'inbox',
          sentTo: recipient.display_name,
        });
      }

      return res.status(400).json({ error: 'Invalid shareMethod. Use "sms" or "inbox"' });
    } catch (err) {
      console.error('Report share error:', err);
      return res.status(500).json({ error: 'Failed to share report', details: err.message });
    }
  }
);

// ============================================================================
// GET /api/dates/status - Public endpoint for contacts to check date status
// ============================================================================
router.get('/status', async (req, res) => {
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
});

// ============================================================================
// Helper function: Build share summary
// ============================================================================
function buildShareSummary(checkout, user) {
  const dateTime = new Date(checkout.scheduled_time).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZone: 'America/Chicago',
  });

  const formatted = {
    userName: user.display_name || 'SafeTea User',
    dateName: checkout.date_name,
    datePhotoUrl: checkout.date_photo_url,
    venue: checkout.venue_name,
    address: checkout.venue_address,
    dateTime,
    estimatedReturn: checkout.estimated_return
      ? new Date(checkout.estimated_return).toLocaleString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          timeZone: 'America/Chicago',
        })
      : null,
    status: checkout.status,
    shareCode: checkout.share_code,
    notes: checkout.notes,
  };

  const smsText = [
    `SafeTea Date Alert`,
    ``,
    `${formatted.userName} is meeting ${formatted.dateName}`,
    `Where: ${formatted.venue}${formatted.address ? ' (' + formatted.address + ')' : ''}`,
    `When: ${formatted.dateTime}`,
    formatted.estimatedReturn ? `Expected back by: ${formatted.estimatedReturn}` : '',
    ``,
    `Track status: https://www.getsafetea.app/date-status?code=${formatted.shareCode}`,
    ``,
    `- SafeTea: Stay Safe`,
  ]
    .filter(Boolean)
    .join('\n');

  return { formatted, smsText };
}

module.exports = router;
