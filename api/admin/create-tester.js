const bcrypt = require('bcryptjs');
const { getOne, run } = require('../_utils/db');
const { generateToken, cors } = require('../_utils/auth');

/**
 * POST /api/admin/create-tester
 * Creates a tester account with full access (admin, plus, all verifications, max trust score).
 * Requires MIGRATE_SECRET for auth.
 *
 * Body: { email, password, display_name, city }
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = process.env.MIGRATE_SECRET;
  if (!secret) return res.status(500).json({ error: 'MIGRATE_SECRET not configured' });

  const authHeader = req.headers.authorization || '';
  const provided = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : req.query.secret;
  if (provided !== secret) return res.status(401).json({ error: 'Unauthorized' });

  let body = req.body;
  if (!body || typeof body === 'string') {
    try { body = JSON.parse(body || '{}'); } catch (e) { body = {}; }
  }

  const email = (body.email || '').toLowerCase().trim();
  const password = body.password || '';
  const displayName = body.display_name || 'Tester';
  const city = body.city || null;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required' });
  }
  if (password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters' });
  }

  try {
    // Check if already exists
    const existing = await getOne('SELECT id, email FROM users WHERE email = $1', [email]);
    if (existing) {
      // Upgrade existing user to full access
      await run(
        `UPDATE users SET
          role = 'admin',
          subscription_tier = 'plus',
          identity_verified = true,
          age_verified = true,
          gender_verified = true,
          is_verified = true,
          phone_verified = true,
          didit_verified = true,
          trust_score = 100,
          trust_score_updated_at = NOW()
        WHERE id = $1`,
        [existing.id]
      );
      const user = await getOne(
        'SELECT id, email, display_name, role, subscription_tier, trust_score, city FROM users WHERE id = $1',
        [existing.id]
      );
      const token = generateToken(user);
      return res.status(200).json({
        message: 'Existing user upgraded to full-access tester',
        token,
        user
      });
    }

    // Create new user
    const passwordHash = await bcrypt.hash(password, 10);
    await run(
      `INSERT INTO users (email, password_hash, display_name, city, role, subscription_tier,
        identity_verified, age_verified, gender_verified, is_verified, phone_verified,
        didit_verified, trust_score, trust_score_updated_at)
       VALUES ($1, $2, $3, $4, 'admin', 'plus', true, true, true, true, true, true, 100, NOW())`,
      [email, passwordHash, displayName, city]
    );

    const user = await getOne(
      'SELECT id, email, display_name, role, subscription_tier, trust_score, city FROM users WHERE email = $1',
      [email]
    );
    const token = generateToken(user);

    return res.status(201).json({
      message: 'Tester account created with full access',
      token,
      user
    });
  } catch (err) {
    console.error('Create tester error:', err);
    return res.status(500).json({ error: 'Failed to create tester', details: err.message });
  }
};
