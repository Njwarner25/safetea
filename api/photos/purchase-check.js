const { authenticate, cors } = require('../_utils/auth');

const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
const PRICE_ID = process.env.STRIPE_PHOTO_CHECK_PRICE_ID;

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

  if (!STRIPE_SECRET || !PRICE_ID) {
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    const stripe = require('stripe')(STRIPE_SECRET);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price: PRICE_ID,
        quantity: 1,
      }],
      success_url: 'https://www.getsafetea.app/photo-check-success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://www.getsafetea.app/photo-check-cancel',
      metadata: {
        user_id: user.id.toString(),
        type: 'photo_check_extra',
      },
    });

    return res.status(200).json({
      success: true,
      checkoutUrl: session.url,
      sessionId: session.id
    });
  } catch (err) {
    console.error('[PurchaseCheck] Error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
};
