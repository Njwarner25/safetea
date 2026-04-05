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

      // List ALL active recurring prices to find the right ones
      try {
        const prices = await stripe.prices.list({ active: true, type: 'recurring', limit: 20 });
        results.all_active_prices = prices.data.map(p => ({
          id: p.id,
          amount: '$' + (p.unit_amount / 100).toFixed(2),
          currency: p.currency,
          interval: p.recurring ? p.recurring.interval : null,
          product: p.product,
          nickname: p.nickname || null,
        }));
      } catch (e) {
        results.all_active_prices = { error: e.message };
      }

      // List ALL products to find active ones
      try {
        const products = await stripe.products.list({ limit: 20 });
        results.all_products = products.data.map(p => ({
          id: p.id,
          name: p.name,
          active: p.active,
        }));
      } catch (e) {
        results.all_products = { error: e.message };
      }
    } catch (e) {
      results.stripe_test = { success: false, error: e.message };
    }
  }

  return res.status(200).json(results);
};
