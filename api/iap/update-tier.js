const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run } = require('../_utils/db');

const VALID_TIERS = ['free', 'plus', 'pro', 'premium'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { tier, productId } = body;

  if (!tier || !VALID_TIERS.includes(tier)) {
    return res.status(400).json({ error: 'Invalid tier' });
  }

  try {
    await run(
      'UPDATE users SET subscription_tier = $1, apple_product_id = $2 WHERE id = $3',
      [tier, productId || null, user.id]
    );

    return res.json({ success: true, tier });
  } catch (err) {
    console.error('Tier update error:', err);
    return res.status(500).json({ error: 'Failed to update tier' });
  }
};
