const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const results = {
    stripe_key_set: !!stripeKey,
    stripe_key_prefix: stripeKey ? stripeKey.substring(0, 12) + '...' : 'NOT SET',
    anthropic_key_set: !!process.env.ANTHROPIC_API_KEY,
    anthropic_key_prefix: process.env.ANTHROPIC_API_KEY ? process.env.ANTHROPIC_API_KEY.substring(0, 12) + '...' : 'NOT SET',
    app_url: process.env.APP_URL || 'NOT SET',
    prices: {},
    stripe_test: null,
  };

  // Test price IDs
  const priceIds = {
    plus_monthly: 'price_1TDXLUFaKA9n89CXkfEotpfL',
    plus_yearly: 'price_1TEdLTFaKA9n89CX1xY0PG9H',
  };
  results.prices = priceIds;

  if (stripeKey) {
    try {
      const stripe = require('stripe')(stripeKey);

      // Test both prices
      for (const [key, pid] of Object.entries(priceIds)) {
        try {
          const price = await stripe.prices.retrieve(pid);
          results['price_' + key] = {
            success: true,
            price_id: price.id,
            active: price.active,
            currency: price.currency,
            unit_amount: price.unit_amount,
            unit_amount_dollars: '$' + (price.unit_amount / 100).toFixed(2),
            product: price.product,
            interval: price.recurring ? price.recurring.interval : null,
          };
        } catch (priceErr) {
          results['price_' + key] = {
            success: false,
            error: priceErr.message,
          };
        }
      }

      // Test creating a checkout session (don't actually save it)
      try {
        const session = await stripe.checkout.sessions.create({
          payment_method_types: ['card'],
          line_items: [{ price: priceIds.plus_monthly, quantity: 1 }],
          mode: 'subscription',
          success_url: 'https://www.getsafetea.app/dashboard.html?upgrade=success',
          cancel_url: 'https://www.getsafetea.app/dashboard.html',
        });
        results.session_test = {
          success: true,
          session_id: session.id,
          url_prefix: session.url ? session.url.substring(0, 60) + '...' : null,
        };
      } catch (sessErr) {
        results.session_test = {
          success: false,
          error: sessErr.message,
          type: sessErr.type,
        };
      }
    } catch (e) {
      results.stripe_test = { success: false, error: e.message };
    }
  }

  return res.status(200).json(results);
};
