const { run, getOne } = require('./_utils/db');
const { cors } = require('./_utils/auth');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SECURITY: Require MIGRATE_SECRET — no fallback
  if (!process.env.MIGRATE_SECRET) {
    return res.status(500).json({ error: 'Not configured' });
  }
  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    const email = req.query.email || 'tester@safetea.app';
    const password = req.query.password || 'SafeTea2026!';
    const name = req.query.name || 'SafeTea Tester';
    const role = req.query.role || 'admin';

    // Check if user already exists
    const existing = await getOne('SELECT id, email, role FROM users WHERE email = $1', [email]);
    if (existing) {
      // Update to full access if needed
      await run(
        'UPDATE users SET role = $1, subscription_tier = $2, updated_at = NOW() WHERE id = $3',
        [role, 'pro', existing.id]
      );
      return res.status(200).json({
        message: 'User already exists — upgraded to full access',
        email: existing.email,
        userId: existing.id,
        role,
        subscription: 'pro'
      });
    }

    const hash = await bcrypt.hash(password, 10);
    const user = await getOne(
      `INSERT INTO users (email, password_hash, display_name, role, city, subscription_tier)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, email, display_name, role`,
      [email, hash, name, role, 'Chicago', 'pro']
    );

    return res.status(200).json({
      message: 'Test user created with full access',
      email,
      password,
      displayName: name,
      userId: user.id,
      role: user.role,
      subscription: 'pro',
      loginUrl: 'https://www.getsafetea.app/login.html'
    });
  } catch (err) {
    console.error('Create test user error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
