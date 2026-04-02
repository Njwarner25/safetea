const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { recalculateTrustScore } = require('../_utils/trust-score');

const ALLOWED_PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'snapchat'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE' && req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { platform } = body;

  if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform' });
  }

  try {
    const existing = await getOne(
      'SELECT id FROM connected_accounts WHERE user_id = $1 AND platform = $2',
      [user.id, platform]
    );
    if (!existing) {
      return res.status(404).json({ error: 'Platform not connected' });
    }

    await run('DELETE FROM connected_accounts WHERE user_id = $1 AND platform = $2', [user.id, platform]);

    // Recalculate trust score (will drop by 20 if was verified)
    const newScore = await recalculateTrustScore(user.id, 'social_disconnected', 'social_' + platform);

    return res.status(200).json({
      success: true,
      platform,
      trustScore: newScore
    });
  } catch (err) {
    console.error('[DisconnectSocial] Error:', err);
    return res.status(500).json({ error: 'Failed to disconnect social account' });
  }
};
