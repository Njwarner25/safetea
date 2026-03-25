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
  const { checkoutId, contacts } = body;
  // contacts: [{ name, phone }] — additional contacts to share with (via SMS)

  if (!checkoutId) {
    return res.status(400).json({ error: 'checkoutId is required' });
  }

  try {
    // Verify checkout belongs to this user
    const checkout = await getOne(
      'SELECT * FROM date_checkouts WHERE id = $1 AND user_id = $2',
      [checkoutId, user.id]
    );

    if (!checkout) {
      return res.status(404).json({ error: 'Checkout not found' });
    }

    // Build the share summary
    const summary = buildSummary(checkout, user);

    // Send SMS to new contacts
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    let smsSent = 0;

    if (twilioSid && twilioAuth && twilioPhone && contacts && contacts.length > 0) {
      const twilio = require('twilio')(twilioSid, twilioAuth);

      for (const contact of contacts.slice(0, 5)) {
        if (!contact.phone) continue;

        try {
          // Save as trusted contact
          await run(
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
    return res.status(500).json({ error: 'Failed to share', details: 'See server logs' });
  }
};

function buildSummary(checkout, user) {
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
          hour: 'numeric', minute: '2-digit', timeZone: 'America/Chicago',
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
  ].filter(Boolean).join('\n');

  return { formatted, smsText };
}
