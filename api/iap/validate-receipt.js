const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

const APPLE_VERIFY_PRODUCTION = 'https://buy.itunes.apple.com/verifyReceipt';
const APPLE_VERIFY_SANDBOX = 'https://sandbox.itunes.apple.com/verifyReceipt';

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { receipt } = body;

  if (!receipt) {
    return res.status(400).json({ valid: false, error: 'No receipt provided' });
  }

  const sharedSecret = process.env.APPLE_SHARED_SECRET;
  if (!sharedSecret) {
    console.error('APPLE_SHARED_SECRET not configured');
    return res.status(500).json({ valid: false, error: 'Server configuration error' });
  }

  try {
    // Try production first
    let result = await verifyWithApple(APPLE_VERIFY_PRODUCTION, receipt, sharedSecret);

    // Status 21007 = sandbox receipt sent to production — retry with sandbox
    if (result.status === 21007) {
      result = await verifyWithApple(APPLE_VERIFY_SANDBOX, receipt, sharedSecret);
    }

    if (result.status !== 0) {
      return res.json({ valid: false, status: result.status });
    }

    const latestInfo = result.latest_receipt_info || [];

    // Find the most recent active subscription
    const now = Date.now();
    const active = latestInfo
      .filter((item) => parseInt(item.expires_date_ms, 10) > now)
      .sort((a, b) => parseInt(b.expires_date_ms, 10) - parseInt(a.expires_date_ms, 10));

    if (active.length > 0) {
      const sub = active[0];
      // All paid products map to 'plus' tier (accept legacy 'pro' and 'safetyplus' product IDs)
      const tier = (sub.product_id.includes('plus') || sub.product_id.includes('pro') || sub.product_id.includes('safetyplus') || sub.product_id.includes('premium'))
        ? 'plus'
        : 'free';

      // Update user tier in database
      await run(
        'UPDATE users SET subscription_tier = $1, apple_product_id = $2, apple_expires_at = $3 WHERE id = $4',
        [tier, sub.product_id, new Date(parseInt(sub.expires_date_ms, 10)), user.id]
      );
    }

    return res.json({
      valid: true,
      subscriptionInfo: active,
    });
  } catch (err) {
    console.error('Receipt validation error:', err);
    return res.status(500).json({ valid: false, error: 'Validation failed' });
  }
};

async function verifyWithApple(url, receipt, sharedSecret) {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'receipt-data': receipt,
      password: sharedSecret,
      'exclude-old-transactions': true,
    }),
  });
  return response.json();
}
