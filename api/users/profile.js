const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET: Return user profile
  if (req.method === 'GET') {
    return res.status(200).json({ user });
  }

  // PUT: Update user profile
  if (req.method === 'PUT') {
    const body = await parseBody(req);
    const updates = [];
    const values = [];
    let paramIdx = 1;

    const allowedFields = [
      'display_name', 'city', 'bio',
      'avatar_type', 'avatar_color', 'avatar_initial', 'avatar_url',
      'custom_display_name'
    ];

    for (const field of allowedFields) {
      if (body[field] !== undefined) {
        updates.push(field + ' = $' + paramIdx);
        values.push(body[field]);
        paramIdx++;
      }
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updates.push('updated_at = NOW()');
    values.push(user.id);

    try {
      await run(
        'UPDATE users SET ' + updates.join(', ') + ' WHERE id = $' + paramIdx,
        values
      );

      const updated = await getOne(
        `SELECT id, email, display_name, role, city, bio,
                avatar_type, avatar_color, avatar_initial, avatar_url,
                custom_display_name, subscription_tier
         FROM users WHERE id = $1`,
        [user.id]
      );

      return res.status(200).json({ user: updated });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update profile', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
