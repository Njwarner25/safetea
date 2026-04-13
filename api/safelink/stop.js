const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey } = body;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Missing sessionKey' });
  }

  try {
    const session = await getOne(
      `SELECT * FROM safelink_sessions WHERE session_key = $1 AND user_id = $2 AND status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active SafeLink session not found' });
    }

    await run(
      `UPDATE safelink_sessions SET status = 'ended', stopped_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    // Notify trusted contacts that user is safe
    let contacts = [];
    try {
      contacts = await getMany(
        'SELECT contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
    } catch (e) {}

    const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    let twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;
    const twilioConfigured = !!(twilioSid && twilioAuth && twilioPhone);

    let smsSent = 0;
    if (contacts.length > 0 && twilioConfigured) {
      const smsBody = `${displayName} has ended their SafeLink. They've arrived safely. — SafeTea`;
      const twilio = require('twilio')(twilioSid, twilioAuth);
      for (const contact of contacts) {
        try {
          await twilio.messages.create({ body: smsBody, from: twilioPhone, to: contact.contact_phone });
          smsSent++;
        } catch (smsErr) {
          console.error('SafeLink stop SMS failed to ' + contact.contact_phone + ':', smsErr.message);
        }
      }
    }

    return res.status(200).json({
      success: true,
      sessionKey,
      stoppedAt: new Date().toISOString(),
      smsSent,
    });
  } catch (err) {
    console.error('SafeLink stop error:', err);
    return res.status(500).json({ error: 'Failed to stop SafeLink', details: err.message });
  }
};
