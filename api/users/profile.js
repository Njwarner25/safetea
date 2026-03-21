const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
          if (req.method === 'GET') {
                  return res.status(200).json({ user });
          }

      if (req.method === 'PUT') {
              const { display_name, city, bio } = req.body;

            await run(
                      'UPDATE users SET display_name = COALESCE($1, display_name), city = COALESCE($2, city), bio = COALESCE($3, bio), updated_at = NOW() WHERE id = $4',
                      [display_name || null, city || null, bio || null, user.id]
                    );

            const updated = await getOne(
                      'SELECT id, email, display_name, role, city, bio, created_at FROM users WHERE id = $1',
                      [user.id]
                    );

            return res.status(200).json({ user: updated });
      }

      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
          console.error('Profile error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
