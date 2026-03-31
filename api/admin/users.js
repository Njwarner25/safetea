const { authenticate, cors } = require('../_utils/auth');
const { getMany, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    const q = (req.query.q || '').trim();
    const filter = req.query.filter || 'all'; // all, banned, suspended, verified, unverified
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = 20;
    const offset = (page - 1) * limit;

    let where = 'WHERE 1=1';
    const params = [];
    let paramIdx = 0;

    if (q.length >= 2) {
      paramIdx++;
      where += ` AND (LOWER(display_name) LIKE $${paramIdx} OR LOWER(custom_display_name) LIKE $${paramIdx} OR LOWER(email) LIKE $${paramIdx} OR LOWER(phone) LIKE $${paramIdx} OR CAST(id AS TEXT) = $${paramIdx + 1})`;
      params.push('%' + q.toLowerCase() + '%', q);
      paramIdx++;
    }

    if (filter === 'banned') {
      where += ` AND banned = true AND (ban_type = 'permanent' OR ban_type IS NULL)`;
    } else if (filter === 'suspended') {
      where += ` AND banned = true AND ban_type = 'temporary'`;
    } else if (filter === 'verified') {
      where += ' AND is_verified = true';
    } else if (filter === 'unverified') {
      where += ' AND (is_verified IS NOT TRUE)';
    }

    const countResult = await getOne(
      `SELECT COUNT(*) as total FROM users ${where}`,
      params
    );
    const total = parseInt(countResult.total);

    const users = await getMany(
      `SELECT id, email, phone, display_name, custom_display_name, role, city,
              subscription_tier, is_verified, age_verified, identity_verified, gender_verified,
              banned, banned_at, ban_reason, ban_type, ban_until,
              avatar_color, avatar_initial, created_at
       FROM users ${where}
       ORDER BY created_at DESC
       LIMIT $${paramIdx + 1} OFFSET $${paramIdx + 2}`,
      [...params, limit, offset]
    );

    return res.status(200).json({
      users,
      total,
      page,
      totalPages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Admin users error:', err);
    return res.status(500).json({ error: 'Failed to load users' });
  }
};
