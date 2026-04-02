const { authenticate, cors } = require('../_utils/auth');
const { getMany, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const debug = {};

  // 1. Check recording_contacts
  try {
    const contacts = await getMany(
      'SELECT id, contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
      [user.id]
    );
    debug.recording_contacts = contacts.map(c => ({
      id: c.id,
      name: c.contact_name,
      phone: c.contact_phone,
      phoneLength: (c.contact_phone || '').length,
      startsWithPlus: (c.contact_phone || '').startsWith('+')
    }));
  } catch (e) {
    debug.recording_contacts_error = e.message;
  }

  // 2. Check date_trusted_contacts fallback
  try {
    const checkout = await getOne(
      `SELECT id FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );
    if (checkout) {
      const dtc = await getMany(
        'SELECT * FROM date_trusted_contacts WHERE checkout_id = $1',
        [checkout.id]
      );
      debug.date_trusted_contacts = dtc.length;
    } else {
      debug.active_checkout = false;
    }
  } catch (e) {
    debug.date_contacts_error = e.message;
  }

  // 3. Twilio config
  debug.twilio = {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'set (' + process.env.TWILIO_ACCOUNT_SID.substring(0, 6) + '...)' : 'MISSING',
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'set (length: ' + process.env.TWILIO_AUTH_TOKEN.length + ')' : 'MISSING',
    PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING'
  };

  // 4. Try sending a test SMS to the first contact
  const contacts = debug.recording_contacts || [];
  if (contacts.length > 0 && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const testResult = await twilio.messages.create({
        body: 'SafeTea SMS test — if you received this, SMS is working.',
        from: process.env.TWILIO_PHONE_NUMBER,
        to: contacts[0].phone,
      });
      debug.test_sms = { success: true, sid: testResult.sid, status: testResult.status, to: contacts[0].phone };
    } catch (smsErr) {
      debug.test_sms = { success: false, error: smsErr.message, code: smsErr.code, to: contacts[0].phone };
    }
  } else {
    debug.test_sms = 'skipped — no contacts or twilio not configured';
  }

  // 5. Recent sessions
  try {
    const sessions = await getMany(
      'SELECT session_key, status, contacts_notified, created_at FROM recording_sessions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 3',
      [user.id]
    );
    debug.recent_sessions = sessions;
  } catch (e) {}

  debug.user_id = user.id;
  debug.subscription_tier = user.subscription_tier;

  return res.status(200).json(debug);
};
