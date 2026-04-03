const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const debug = {
    TWILIO_VERIFY_SERVICE_SID: process.env.TWILIO_VERIFY_SERVICE_SID ? 'set (' + process.env.TWILIO_VERIFY_SERVICE_SID.substring(0, 8) + '...)' : 'MISSING',
    TWILIO_ACCOUNT_SID: process.env.TWILIO_ACCOUNT_SID ? 'set' : 'MISSING',
    TWILIO_AUTH_TOKEN: process.env.TWILIO_AUTH_TOKEN ? 'set' : 'MISSING',
    TWILIO_PHONE_NUMBER: process.env.TWILIO_PHONE_NUMBER || 'MISSING',
  };

  // Try sending a test verification if Verify is configured
  if (process.env.TWILIO_VERIFY_SERVICE_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const service = await twilio.verify.v2.services(process.env.TWILIO_VERIFY_SERVICE_SID).fetch();
      debug.verify_service = {
        name: service.friendlyName,
        sid: service.sid,
        status: 'found'
      };
    } catch (e) {
      debug.verify_service = { error: e.message, code: e.code };
    }
  }

  return res.status(200).json(debug);
};
