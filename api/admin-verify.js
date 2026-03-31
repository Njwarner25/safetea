const { run, getOne } = require('./_utils/db');
const { authenticate, cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Require JWT admin auth instead of query-param secret
  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    const userId = req.query.id;
    if (!userId) return res.status(400).json({ error: 'id param required' });

    await run(
      'UPDATE users SET age_verified = true, identity_verified = true, gender_verified = true, is_verified = true, verified_at = NOW() WHERE id = $1',
      [userId]
    );

    const target = await getOne(
      'SELECT id, display_name, age_verified, identity_verified, gender_verified, is_verified FROM users WHERE id = $1',
      [userId]
    );

    return res.status(200).json({ message: 'User fully verified', user: target });
  } catch (err) {
    console.error('Admin verify error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
