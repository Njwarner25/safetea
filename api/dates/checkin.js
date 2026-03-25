const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { checkoutId, safetyRating, notes } = body;

  if (!checkoutId) {
    return res.status(400).json({ error: 'checkoutId is required' });
  }

  try {
    // Verify the checkout belongs to this user and is still active
    const checkout = await getOne(
      'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
      [checkoutId, user.id]
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
    const contacts = await getMany(
      'SELECT * FROM date_trusted_contacts WHERE checkout_id = $1',
      [checkoutId]
    );

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
      const twilio = require('twilio')(twilioSid, twilioAuth);
      const message = `SafeTea Update: ${user.display_name || 'Your contact'} has checked in safely from their date with ${checkout.date_name}. ✅\n\nThey made it home safe.`;

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
      contacts: contacts.map(c => ({ name: c.contact_name, phone: c.contact_phone })),
    });
  } catch (err) {
    console.error('Checkin error:', err);
    return res.status(500).json({ error: 'Failed to check in', details: err.message });
  }
};
