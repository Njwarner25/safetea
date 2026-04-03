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
  const tier = (body.tier || 'plus').toLowerCase();
  const role = tier === 'free' ? 'user' : 'admin';

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
      // Update existing user
      var isFree = tier === 'free';
      await run(
        `UPDATE users SET
          role = $2,
          subscription_tier = $3,
          identity_verified = $5,
          age_verified = $5,
          gender_verified = $5,
          is_verified = $5,
          phone_verified = $5,
          didit_verified = $5,
          trust_score = $4,
          trust_score_updated_at = NOW()
        WHERE id = $1`,
        [existing.id, role, tier, isFree ? 0 : 100, !isFree]
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
    var isFreeNew = tier === 'free';
    await run(
      `INSERT INTO users (email, password_hash, display_name, city, role, subscription_tier,
        identity_verified, age_verified, gender_verified, is_verified, phone_verified,
        didit_verified, trust_score, trust_score_updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7, $7, $7, $7, $7, $8, NOW())`,
      [email, passwordHash, displayName, city, role, tier, !isFreeNew, isFreeNew ? 0 : 100]
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
