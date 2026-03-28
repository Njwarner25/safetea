const { getOne, run } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { idToken, referralCode } = body;

    if (!idToken) {
      return res.status(400).json({ error: 'Firebase ID token is required' });
    }

    // Verify Firebase ID token using Google's public keys
    const decoded = await verifyFirebaseToken(idToken);
    if (!decoded) {
      return res.status(401).json({ error: 'Invalid or expired Firebase token' });
    }

    const phone = decoded.phone_number;
    if (!phone) {
      return res.status(400).json({ error: 'No phone number in Firebase token' });
    }

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
        [phone + '@phone.safetea', phone, 'firebase-phone-auth', 'New Member', '?', avatar_color]
      );

      user = await getOne('SELECT * FROM users WHERE phone = $1', [phone]);

      // Track referral if provided
      if (referralCode && user) {
        try {
          const refCodeRow = await getOne(
            'SELECT * FROM referral_codes WHERE code = $1',
            [referralCode.trim().toUpperCase()]
          );
          if (refCodeRow && refCodeRow.user_id !== user.id) {
            const existingRef = await getOne(
              'SELECT * FROM referrals WHERE referred_user_id = $1',
              [user.id]
            );
            if (!existingRef) {
              await run(
                "INSERT INTO referrals (referrer_id, referred_user_id, referral_code_id, status) VALUES ($1, $2, $3, 'signed_up')",
                [refCodeRow.user_id, user.id, refCodeRow.id]
              );
              await run('UPDATE users SET referred_by = $1 WHERE id = $2', [refCodeRow.user_id, user.id]);
            }
          }
        } catch (refErr) {
          console.error('Referral tracking error (non-fatal):', refErr.message);
        }
      }
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
    console.error('Firebase verify error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};

// Verify Firebase ID token using Google's public keys (no firebase-admin needed)
async function verifyFirebaseToken(idToken) {
  const jwt = require('jsonwebtoken');

  // Decode header to get key ID
  const header = JSON.parse(Buffer.from(idToken.split('.')[0], 'base64url').toString());
  const kid = header.kid;

  if (!kid) return null;

  // Fetch Google's public keys for Firebase
  const keysRes = await fetch('https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com');
  const keys = await keysRes.json();

  const publicKey = keys[kid];
  if (!publicKey) return null;

  // Verify the token
  const projectId = process.env.FIREBASE_PROJECT_ID;
  if (!projectId) {
    console.error('FIREBASE_PROJECT_ID env var not set');
    return null;
  }

  try {
    const decoded = jwt.verify(idToken, publicKey, {
      algorithms: ['RS256'],
      audience: projectId,
      issuer: `https://securetoken.google.com/${projectId}`,
    });

    // Must have a subject (user ID)
    if (!decoded.sub) return null;

    return decoded;
  } catch (err) {
    console.error('JWT verify failed:', err.message);
    return null;
  }
}
