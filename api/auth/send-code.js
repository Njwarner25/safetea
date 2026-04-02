const { getOne, run } = require('../_utils/db');
const { cors, parseBody } = require('../_utils/auth');

// Normalize phone number to E.164 format
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (phone.startsWith('+')) return phone;
  return '+' + digits;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { phone: rawPhone } = body;

    if (!rawPhone || !rawPhone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const phone = normalizePhone(rawPhone.trim());

    // Rate limit: max 5 codes per phone per hour
    try {
      const recentAttempts = await getOne(
        "SELECT COUNT(*) as count FROM phone_verifications WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'",
        [phone]
      );
      if (recentAttempts && parseInt(recentAttempts.count) >= 5) {
        return res.status(429).json({ error: 'Too many verification attempts. Please try again later.' });
      }
    } catch (e) { /* table may not exist yet */ }

    // Use Twilio Verify API if TWILIO_VERIFY_SERVICE_SID is set (handles compliance automatically)
    if (process.env.TWILIO_VERIFY_SERVICE_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const verification = await twilio.verify.v2
          .services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verifications.create({ to: phone, channel: 'sms' });
        console.log(`Twilio Verify sent to ${phone}, status: ${verification.status}`);

        return res.status(200).json({
          status: 200,
          data: {
            message: 'Verification code sent',
            phone: phone,
            method: 'twilio_verify'
          }
        });
      } catch (err) {
        console.error('Twilio Verify error:', err.message, err.code);
        return res.status(500).json({ error: 'Failed to send verification code: ' + err.message });
      }
    }

    // Fallback: generate our own OTP and send via Twilio Messages API
    const crypto = require('crypto');
    const code = crypto.randomInt(100000, 999999).toString();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString();

    await run(
      "INSERT INTO phone_verifications (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, code, expiresAt]
    );

    let fromPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (fromPhone && !fromPhone.startsWith('+')) fromPhone = '+' + fromPhone;

    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && fromPhone) {
      try {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await twilio.messages.create({
          body: `Your SafeTea verification code is: ${code}. It expires in 10 minutes.`,
          from: fromPhone,
          to: phone
        });
      } catch (err) {
        console.error('Twilio SMS error:', err.message, err.code);
        return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
      }
    } else {
      console.log(`[DEV] OTP for ${phone}: ${code}`);
    }

    return res.status(200).json({
      status: 200,
      data: {
        message: 'Verification code sent',
        phone: phone,
        method: 'sms',
        ...(process.env.NODE_ENV !== 'production' && { dev_code: code })
      }
    });
  } catch (error) {
    console.error('Send code error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
