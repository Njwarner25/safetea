const { authenticate, cors, parseBody } = require('../_utils/auth');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PRICE_SINGLE = process.env.STRIPE_PHOTO_CHECK_PRICE_ID;          // $0.99 — 1 extra check
const PRICE_10PACK = process.env.STRIPE_PHOTO_CHECK_10PACK_PRICE_ID;   // $7.99 — 10 extra checks

const PACKAGES = {
  single: { priceId: PRICE_SINGLE, checks: 1,  label: '1 Extra Photo Check — $0.99' },
  '10pack': { priceId: PRICE_10PACK, checks: 10, label: '10 Photo Checks — $7.99 (save ~$2)' },
};

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tier gate — SafeTea+ required
  if (!user.subscription_tier || !['plus', 'pro', 'premium'].includes(user.subscription_tier)) {
    return res.status(403).json({ error: 'SafeTea+ subscription required' });
  }

  const body = await parseBody(req);
  const packageType = body.package || 'single';  // "single" or "10pack"
  const pkg = PACKAGES[packageType];

  if (!pkg) {
    return res.status(400).json({
      error: 'Invalid package type. Choose "single" ($0.99) or "10pack" ($7.99)',
      available: Object.keys(PACKAGES).map(k => ({ type: k, ...PACKAGES[k], priceId: undefined })),
    });
  }

  if (!STRIPE_SECRET || !pkg.priceId) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    const stripe = require('stripe')(STRIPE_SECRET);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price: pkg.priceId,
        quantity: 1,
      }],
      success_url: 'https://www.getsafetea.app/photo-check-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.getsafetea.app/photo-check-cancel',
      metadata: {
        user_id: user.id.toString(),
        type: 'photo_check_extra',
        package: packageType,
        checks: pkg.checks.toString(),
      },
    });

    return res.status(200).json({
      success: true,
      package: packageType,
      checksIncluded: pkg.checks,
      label: pkg.label,
      checkoutUrl: session.url,
      sessionId: session.id,
    });
  } catch (err) {
    console.error('[PurchaseCheck] Error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
