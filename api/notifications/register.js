const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { token, platform } = body;

  if (!token || typeof token !== 'string' || token.length < 10) {
    return res.status(400).json({ error: 'Valid push token is required' });
  }

  const plat = (platform === 'android') ? 'android' : 'ios';

  try {
    // Upsert: insert or ignore if already exists
    const existing = await getOne(
      'SELECT id FROM push_tokens WHERE user_id = $1 AND token = $2',
      [user.id, token]
    );

    if (!existing) {
      await run(
        'INSERT INTO push_tokens (user_id, token, platform) VALUES ($1, $2, $3)',
        [user.id, token, plat]
      );
    }

    return res.status(200).json({ message: 'Push token registered' });
  } catch (err) {
    console.error('[PushToken] Registration failed:', err.message);
    return res.status(500).json({ error: 'Failed to register push token' });
  }
};
