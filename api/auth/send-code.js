const crypto = require('crypto');
const { getOne, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');

// Generate a 6-digit OTP
function generateOTP() {
  return crypto.randomInt(100000, 999999).toString();
}

// Normalize phone number to E.164 format
function normalizePhone(phone) {
  const digits = phone.replace(/\D/g, '');
  if (digits.length === 10) return '+1' + digits;
  if (digits.length === 11 && digits.startsWith('1')) return '+' + digits;
  if (phone.startsWith('+')) return phone;
  return '+' + digits;
}

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { phone: rawPhone } = req.body || {};

    if (!rawPhone || !rawPhone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }

    const phone = normalizePhone(rawPhone.trim());

    // Rate limit: max 5 codes per phone per hour
    const recentAttempts = await getOne(
      "SELECT COUNT(*) as count FROM phone_verifications WHERE phone = $1 AND created_at > NOW() - INTERVAL '1 hour'",
      [phone]
    );

    if (recentAttempts && parseInt(recentAttempts.count) >= 5) {
      return res.status(429).json({ error: 'Too many verification attempts. Please try again later.' });
    }

    // Invalidate previous codes for this phone
    await run(
      "UPDATE phone_verifications SET used = true WHERE phone = $1 AND used = false",
      [phone]
    );

    const code = generateOTP();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

    // Store the OTP
    await run(
      "INSERT INTO phone_verifications (phone, code, expires_at) VALUES ($1, $2, $3)",
      [phone, code, expiresAt]
    );

    // Send via Twilio if configured
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER) {
      try {
        const twilio = require('twilio');
        const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        await client.messages.create({
          body: `Your SafeTea verification code is: ${code}. It expires in 10 minutes.`,
          from: process.env.TWILIO_PHONE_NUMBER,
          to: phone
        });
        console.log(`OTP sent to ${phone} via Twilio`);
      } catch (err) {
        console.error('Twilio send error:', err.message);
        // Don't fail — fall through to dev mode logging
      }
    } else {
      console.log(`[DEV] OTP for ${phone}: ${code}`);
    }

    return res.status(200).json({
      status: 200,
      data: {
        message: 'Verification code sent',
        phone: phone,
        ...(process.env.NODE_ENV !== 'production' && { dev_code: code })
      }
    });
  } catch (error) {
    console.error('Send code error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
