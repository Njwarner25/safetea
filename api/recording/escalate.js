const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey, level } = body;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Missing sessionKey' });
  }

  try {
    const session = await getOne(
      `SELECT * FROM recording_sessions WHERE session_key = $1 AND user_id = $2 AND status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording session not found' });
    }

    // Mark as escalated
    await run(
      `UPDATE recording_sessions SET escalated_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    // Send escalation SMS to trusted contacts
    let contactsNotified = 0;
    const activeCheckout = await getOne(
      `SELECT * FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    let contacts = [];
    if (activeCheckout) {
      contacts = await getMany(
        `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
        [activeCheckout.id]
      );
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
      const twilio = require('twilio')(twilioSid, twilioAuth);
      const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';
      const gpsLink = session.latitude && session.longitude
        ? `https://maps.google.com/?q=${session.latitude},${session.longitude}`
        : null;
      const recordingUrl = `https://www.getsafetea.app/recording-status?key=${sessionKey}`;

      const escalationLevel = parseInt(level) || 1;
      const minutesLabel = escalationLevel >= 2 ? '30+' : '15+';
      const urgencyPrefix = escalationLevel >= 2 ? '🚨 URGENT — SECOND ALERT' : '⚠️ NO RESPONSE';

      const message =
        `${urgencyPrefix} — SafeTea\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `${displayName}'s recording has been active for ${minutesLabel} minutes with no check-in.\n\n` +
        (gpsLink ? `GPS: ${gpsLink}\n` : '') +
        `Recording: ${recordingUrl}\n\n` +
        `Please check on them immediately or call 911.\n` +
        `━━━━━━━━━━━━━━━━━`;

      for (const contact of contacts) {
        try {
          await twilio.messages.create({
            body: message,
            from: twilioPhone,
            to: contact.contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error(`Escalation SMS failed to ${contact.contact_phone}:`, smsErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      escalated: true,
      contactsNotified,
    });
  } catch (err) {
    console.error('Recording escalate error:', err);
    return res.status(500).json({ error: 'Failed to escalate', details: err.message });
  }
};
