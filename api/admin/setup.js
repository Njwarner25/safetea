const { run, getOne } = require('../_utils/db');
const { cors } = require('../_utils/auth');

/**
 * POST /api/admin/setup
 * One-time admin setup — promote a user to admin role.
 * Requires MIGRATE_SECRET for auth (no JWT needed).
 *
 * Body: { email: "user@example.com" }
 * Header: Authorization: Bearer <MIGRATE_SECRET>
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
  if (!body && req.query.email) body = { email: req.query.email };

  const email = (body.email || '').toLowerCase().trim();
  if (!email) return res.status(400).json({ error: 'email is required' });

  try {
    const user = await getOne('SELECT id, email, role, display_name FROM users WHERE email = $1', [email]);
    if (!user) return res.status(404).json({ error: 'User not found with that email' });

    await run('UPDATE users SET role = $1, subscription_tier = $2 WHERE id = $3', ['admin', 'plus', user.id]);

    const updated = await getOne('SELECT id, email, role, display_name, subscription_tier FROM users WHERE id = $1', [user.id]);
    return res.status(200).json({ message: 'User promoted to admin', user: updated });
  } catch (err) {
    console.error('Admin setup error:', err);
    return res.status(500).json({ error: 'Failed to set admin', details: err.message });
  }
};
