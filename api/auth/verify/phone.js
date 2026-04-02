const { getOne, run } = require('../../_utils/db');
const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { recalculateTrustScore } = require('../../_utils/trust-score');

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
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = await parseBody(req);
    const { phone: rawPhone, code } = body;

    if (!rawPhone || !rawPhone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
    }

    const phone = normalizePhone(rawPhone.trim());

    // Try Twilio Verify API first if configured
    if (process.env.TWILIO_VERIFY_SERVICE_SID && process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      try {
        const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
        const check = await twilio.verify.v2
          .services(process.env.TWILIO_VERIFY_SERVICE_SID)
          .verificationChecks.create({ to: phone, code: code.trim() });

        if (check.status !== 'approved') {
          return res.status(401).json({ error: 'Invalid or expired verification code' });
        }

        // Code verified — update user
        await run(
          'UPDATE users SET phone_verified = true, phone = $1, updated_at = NOW() WHERE id = $2',
          [phone, user.id]
        );
        const newScore = await recalculateTrustScore(user.id, 'phone_verified', 'phone');

        return res.status(200).json({
          success: true,
          phone_verified: true,
          trustScore: newScore,
          message: 'Phone verified! +10 trust points earned.'
        });
      } catch (err) {
        console.error('Twilio Verify check error:', err.message, err.code);
        // If Verify fails (e.g. code expired), return the error
        if (err.code === 20404) {
          return res.status(401).json({ error: 'Verification code expired. Please request a new one.' });
        }
        return res.status(401).json({ error: 'Invalid or expired verification code' });
      }
    }

    // Fallback: check against phone_verifications table
    const verification = await getOne(
      "SELECT * FROM phone_verifications WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [phone, code.trim()]
    );

    if (!verification) {
      const recent = await getOne(
        "SELECT id FROM phone_verifications WHERE phone = $1 AND used = false ORDER BY created_at DESC LIMIT 1",
        [phone]
      );
      if (recent) {
        await run("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1", [recent.id]);
      }
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    if (verification.attempts >= 5) {
      await run("UPDATE phone_verifications SET used = true WHERE id = $1", [verification.id]);
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    await run("UPDATE phone_verifications SET used = true, verified_at = NOW() WHERE id = $1", [verification.id]);

    await run(
      'UPDATE users SET phone_verified = true, phone = $1, updated_at = NOW() WHERE id = $2',
      [phone, user.id]
    );

    const newScore = await recalculateTrustScore(user.id, 'phone_verified', 'phone');

    return res.status(200).json({
      success: true,
      phone_verified: true,
      trustScore: newScore,
      message: 'Phone verified! +10 trust points earned.'
    });
  } catch (error) {
    console.error('Phone verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
