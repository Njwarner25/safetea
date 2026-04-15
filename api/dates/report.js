const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ========== GET: Get SafeTea Report for a checkout ==========
  if (req.method === 'GET') {
    const checkoutId = req.query.id;
    if (!checkoutId) return res.status(400).json({ error: 'Checkout ID required' });

    try {
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, user.id]
      );
      if (!checkout) return res.status(404).json({ error: 'Checkout not found' });

      const contacts = await getMany(
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
          userName: user.display_name || 'SafeTea User',
          dateName: checkout.date_name,
          datePhotoUrl: checkout.date_photo_url,
          venue: checkout.venue_name,
          address: checkout.venue_address,
          transportation: transportLabels[checkout.transportation] || checkout.transportation || 'Not specified',
          transportDetails: checkout.transport_details,
          scheduledTime: checkout.scheduled_time,
          estimatedReturn: checkout.estimated_return,
          notes: checkout.notes,
          status: checkout.status,
          checkedInAt: checkout.checked_in_at,
          safetyRating: checkout.safety_rating,
          createdAt: checkout.created_at,
          trackingUrl: `https://www.getsafetea.app/date-status?code=${checkout.share_code}`,
          contacts: contacts.map(c => ({ name: c.contact_name, notified: c.notified })),
        },
      });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to fetch report', details: err.message });
    }
  }

  // ========== POST: Share SafeTea Report via SMS or Inbox ==========
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const { checkoutId, shareMethod, recipientPhone, recipientUserId } = body;
    // shareMethod: 'sms' or 'inbox'

    if (!checkoutId || !shareMethod) {
      return res.status(400).json({ error: 'checkoutId and shareMethod required' });
    }

    try {
      const checkout = await getOne(
        'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
        [checkoutId, user.id]
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

        const twilio = require('twilio')(twilioSid, twilioAuth);
        const dateTime = new Date(checkout.scheduled_time).toLocaleString('en-US', { timeZone: 'America/Chicago' });
        const transport = transportLabels[checkout.transportation] || checkout.transportation || '';

        const message =
          `SafeTea Report\n` +
          `━━━━━━━━━━━━━━━━━\n` +
          `${user.display_name || 'A SafeTea user'} shared their trip details with you.\n\n` +
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
        await run(
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
      }

      // ---- SHARE VIA INBOX ----
      if (shareMethod === 'inbox') {
        if (!recipientUserId) {
          return res.status(400).json({ error: 'recipientUserId required for inbox sharing' });
        }

        // Verify recipient exists
        const recipient = await getOne('SELECT id, display_name FROM users WHERE id = $1', [recipientUserId]);
        if (!recipient) {
          return res.status(404).json({ error: 'Recipient user not found' });
        }

        const dateTime = new Date(checkout.scheduled_time).toLocaleString('en-US', { timeZone: 'America/Chicago' });
        const transport = transportLabels[checkout.transportation] || checkout.transportation || '';

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
        await run(
          `INSERT INTO messages (sender_id, recipient_id, content, created_at)
           VALUES ($1, $2, $3, NOW())`,
          [user.id, recipientUserId, reportMessage]
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

  return res.status(405).json({ error: 'Method not allowed' });
};
