const { getOne, run } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');

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
    const { phone: rawPhone, code } = body;

    if (!rawPhone || !rawPhone.trim()) {
      return res.status(400).json({ error: 'Phone number is required' });
    }
    if (!code || code.trim().length !== 6) {
      return res.status(400).json({ error: 'Code must be 6 digits' });
    }

    const phone = normalizePhone(rawPhone.trim());

    // Find valid, unused code for this phone
    const verification = await getOne(
      "SELECT * FROM phone_verifications WHERE phone = $1 AND code = $2 AND used = false AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1",
      [phone, code.trim()]
    );

    if (!verification) {
      // Increment attempts for rate limiting
      const recent = await getOne(
        "SELECT id FROM phone_verifications WHERE phone = $1 AND used = false ORDER BY created_at DESC LIMIT 1",
        [phone]
      );
      if (recent) {
        await run("UPDATE phone_verifications SET attempts = attempts + 1 WHERE id = $1", [recent.id]);
      }
      return res.status(401).json({ error: 'Invalid or expired verification code' });
    }

    // Check max attempts on this code
    if (verification.attempts >= 5) {
      await run("UPDATE phone_verifications SET used = true WHERE id = $1", [verification.id]);
      return res.status(429).json({ error: 'Too many incorrect attempts. Please request a new code.' });
    }

    // Mark code as used
    await run("UPDATE phone_verifications SET used = true, verified_at = NOW() WHERE id = $1", [verification.id]);

    // Find or create user by phone number
    let user = await getOne('SELECT * FROM users WHERE phone = $1', [phone]);
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      const colors = ['#E8A0B5', '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6'];
      const avatar_color = colors[Math.floor(Math.random() * colors.length)];

      await run(
        `INSERT INTO users (email, phone, password_hash, display_name, avatar_initial, avatar_color)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [phone + '@phone.safetea', phone, 'phone-auth-no-password', 'New Member', '?', avatar_color]
      );

      user = await getOne('SELECT * FROM users WHERE phone = $1', [phone]);
    }

    // Update last login
    await run('UPDATE users SET updated_at = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user);

    return res.status(200).json({
      status: 200,
      data: {
        message: isNewUser ? 'Account created' : 'Login successful',
        isNewUser,
        needsOnboarding: isNewUser || !user.city || !user.display_name || user.display_name === 'New Member',
        needsVerification: !user.age_verified || !user.identity_verified || !user.gender_verified,
        token,
        user: {
          id: user.id,
          phone: user.phone,
          email: user.email,
          display_name: user.display_name,
          role: user.role,
          city: user.city,
          is_verified: user.is_verified || false,
          age_verified: user.age_verified || false,
          identity_verified: user.identity_verified || false,
          gender_verified: user.gender_verified || false,
          avatar_initial: user.avatar_initial,
          avatar_color: user.avatar_color,
          avatar_type: user.avatar_type || 'initial',
          avatar_url: user.avatar_url || null,
          subscription_tier: user.subscription_tier || 'free'
        }
      }
    });
  } catch (error) {
    console.error('Verify code error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
