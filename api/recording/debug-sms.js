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
    }));
  } catch (e) {
    debug.recording_contacts_error = e.message;
  }

  // 2. Twilio config
  var fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  if (fromNumber && !fromNumber.startsWith('+')) fromNumber = '+' + fromNumber;
  debug.twilio = {
    ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'set (' + process.env.TWILIO_ACCOUNT_SID.substring(0, 6) + '...)' : 'MISSING',
    AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'set (length: ' + process.env.TWILIO_AUTH_TOKEN.length + ')' : 'MISSING',
    PHONE_NUMBER_RAW: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
    PHONE_NUMBER_USED: fromNumber,
  };

  const contacts = debug.recording_contacts || [];
  if (contacts.length > 0 && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && fromNumber) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      // Send a plain ASCII test SMS
      const testResult = await twilio.messages.create({
        body: 'SafeTea test - if you receive this, SMS is working. Reply STOP to opt out.',
        from: fromNumber,
        to: contacts[0].phone,
      });
      debug.test_sms = { success: true, sid: testResult.sid, status: testResult.status, to: contacts[0].phone, from: fromNumber };

      // Wait 2 seconds then check delivery status
      await new Promise(r => setTimeout(r, 2000));
      try {
        const msgStatus = await twilio.messages(testResult.sid).fetch();
        debug.test_sms_delivery = {
          status: msgStatus.status,
          errorCode: msgStatus.errorCode || null,
          errorMessage: msgStatus.errorMessage || null,
          direction: msgStatus.direction,
          price: msgStatus.price,
        };
      } catch (fetchErr) {
        debug.test_sms_delivery = { error: fetchErr.message };
      }

      // Check last 5 messages from this account to see delivery statuses
      try {
        const recentMsgs = await twilio.messages.list({ from: fromNumber, limit: 5 });
        debug.recent_twilio_messages = recentMsgs.map(m => ({
          sid: m.sid,
          to: m.to,
          status: m.status,
          errorCode: m.errorCode || null,
          errorMessage: m.errorMessage || null,
          dateSent: m.dateSent,
          body: m.body ? m.body.substring(0, 60) + '...' : null,
        }));
      } catch (listErr) {
        debug.recent_twilio_messages_error = listErr.message;
      }

    } catch (smsErr) {
      debug.test_sms = { success: false, error: smsErr.message, code: smsErr.code, moreInfo: smsErr.moreInfo, to: contacts[0].phone, from: fromNumber };
    }
  } else {
    debug.test_sms = 'skipped - no contacts or twilio not configured';
  }

  debug.user_id = user.id;
  debug.subscription_tier = user.subscription_tier;

  return res.status(200).json(debug);
};
