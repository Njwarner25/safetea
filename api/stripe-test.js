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

      // Test: retrieve the monthly price to see if it exists
      try {
        const price = await stripe.prices.retrieve(priceIds.plus_monthly);
        results.stripe_test = {
          success: true,
          price_id: price.id,
          active: price.active,
          currency: price.currency,
          unit_amount: price.unit_amount,
          product: price.product,
          recurring: price.recurring,
        };
      } catch (priceErr) {
        results.stripe_test = {
          success: false,
          error: priceErr.message,
          type: priceErr.type,
          code: priceErr.code,
        };
      }
    } catch (e) {
      results.stripe_test = { success: false, error: e.message };
    }
  }

  return res.status(200).json(results);
};
