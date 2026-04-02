const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

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
      name: c.contact_name,
      phone: c.contact_phone,
    }));
  } catch (e) {
    debug.recording_contacts_error = e.message;
  }

  // 2. Twilio config
  var fromNumber = process.env.TWILIO_PHONE_NUMBER || '';
  if (fromNumber && !fromNumber.startsWith('+')) fromNumber = '+' + fromNumber;
  debug.twilio_from = fromNumber;

  const contacts = debug.recording_contacts || [];
  if (contacts.length > 0 && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && fromNumber) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);

      // Check account type (trial vs full)
      try {
        const account = await twilio.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
        debug.account_type = account.type; // 'Trial' or 'Full'
        debug.account_status = account.status;
        debug.account_name = account.friendlyName;
      } catch (e) {
        debug.account_check_error = e.message;
      }

      // Check if the FROM number is a valid Twilio number
      try {
        const incomingNumbers = await twilio.incomingPhoneNumbers.list({ phoneNumber: fromNumber, limit: 1 });
        if (incomingNumbers.length > 0) {
          var num = incomingNumbers[0];
          debug.from_number = {
            valid: true,
            phoneNumber: num.phoneNumber,
            smsEnabled: num.capabilities.sms,
            voiceEnabled: num.capabilities.voice,
            friendlyName: num.friendlyName,
          };
        } else {
          debug.from_number = { valid: false, error: 'Number ' + fromNumber + ' not found in your Twilio account. You need to purchase this number.' };
        }
      } catch (e) {
        debug.from_number_error = e.message;
      }

      // Check if trial account - list verified caller IDs (outgoing)
      try {
        const verified = await twilio.outgoingCallerIds.list({ limit: 10 });
        debug.verified_caller_ids = verified.map(v => ({ phone: v.phoneNumber, name: v.friendlyName }));
      } catch (e) {}

      // Send test SMS
      try {
        const testResult = await twilio.messages.create({
          body: 'SafeTea test - if you get this, SMS works.',
          from: fromNumber,
          to: contacts[0].phone,
        });
        debug.test_sms = { sid: testResult.sid, status: testResult.status };

        // Wait and check delivery
        await new Promise(r => setTimeout(r, 3000));
        const check = await twilio.messages(testResult.sid).fetch();
        debug.test_sms_after_3s = {
          status: check.status,
          errorCode: check.errorCode || null,
          errorMessage: check.errorMessage || null,
        };
      } catch (smsErr) {
        debug.test_sms = { error: smsErr.message, code: smsErr.code };
      }

      // Last 5 messages with full status
      try {
        const msgs = await twilio.messages.list({ from: fromNumber, limit: 5 });
        debug.recent_messages = msgs.map(m => ({
          to: m.to,
          status: m.status,
          errorCode: m.errorCode || null,
          errorMessage: m.errorMessage || null,
          date: m.dateCreated,
          bodySnippet: (m.body || '').substring(0, 50),
        }));
      } catch (e) {}

    } catch (err) {
      debug.twilio_error = err.message;
    }
  }

  return res.status(200).json(debug);
};
