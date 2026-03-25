const { authenticate, cors, parseBody } = require('./_utils/auth');
const { getOne, run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { priceId } = body;

  if (!priceId) {
    return res.status(400).json({ error: 'priceId is required' });
  }

  // Validate price ID against known prices
  const validPrices = {
    // SafeTea+ Monthly
    'price_1TDXLUFaKA9n89CXkfEotpfL': { tier: 'premium', plan: 'plus_monthly' },
    // SafeTea+ Yearly
    'price_1TEdLTFaKA9n89CX1xY0PG9H': { tier: 'premium', plan: 'plus_yearly' },
    // SafeTea Pro Monthly
    'price_1TDXN5FaKA9n89CXeDxnAJMh': { tier: 'premium', plan: 'pro_monthly' },
    // SafeTea Pro Yearly
    'price_1TEdJfFaKA9n89CXZebr3UxW': { tier: 'premium', plan: 'pro_yearly' },
  };

  if (!validPrices[priceId]) {
    return res.status(400).json({ error: 'Invalid price ID' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const stripe = require('stripe')(stripeKey);

    // Check if user already has a Stripe customer ID
    let customerId = user.stripe_customer_id;

    if (!customerId) {
      // Create Stripe customer
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: {
          safetea_user_id: String(user.id),
          display_name: user.display_name || '',
        },
      });
      customerId = customer.id;

      // Save customer ID to database
      await run(
        'UPDATE users SET stripe_customer_id = $1 WHERE id = $2',
        [customerId, user.id]
      );
    }

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ['card'],
      line_items: [
        {
          price: priceId,
          quantity: 1,
        },
      ],
      mode: 'subscription',
      success_url: 'https://www.getsafetea.app/dashboard.html?upgraded=true',
      cancel_url: 'https://www.getsafetea.app/dashboard.html?upgraded=false',
      metadata: {
        safetea_user_id: String(user.id),
        plan: validPrices[priceId].plan,
      },
    });

    return res.status(200).json({
      success: true,
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    console.error('Stripe checkout error:', err);
    return res.status(500).json({ error: 'Failed to create checkout session', details: 'See server logs' });
  }
};
