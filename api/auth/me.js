const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    try {
          const user = await authenticate(req);
          if (!user) {
                  return res.status(401).json({ error: 'Not authenticated' });
          }

      return res.status(200).json({ user });
    } catch (error) {
          console.error('Auth me error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
