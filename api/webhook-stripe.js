const { run, getOne } = require('./_utils/db');

module.exports = async function handler(req, res) {
  // No CORS needed for webhooks — Stripe calls this directly
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!stripeKey) {
    return res.status(500).json({ error: 'Stripe not configured' });
  }

  try {
    const stripe = require('stripe')(stripeKey);

    let event;

    // Verify webhook signature if secret is set
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      // Read raw body for signature verification
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');

      try {
        event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
      } catch (err) {
        console.error('Webhook signature verification failed:', err.message);
        return res.status(400).json({ error: 'Invalid signature' });
      }
    } else {
      // No webhook secret — parse body directly (dev mode)
      const chunks = [];
      for await (const chunk of req) {
        chunks.push(chunk);
      }
      const rawBody = Buffer.concat(chunks).toString('utf8');
      event = JSON.parse(rawBody);
    }

    // Handle the event
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata && (session.metadata.user_id || session.metadata.safetea_user_id);
        const plan = session.metadata && session.metadata.plan;
        const purchaseType = session.metadata && session.metadata.type;

        // Handle photo check extra purchase
        if (purchaseType === 'photo_check_extra' && userId) {
          const currentMonth = new Date().toISOString().slice(0, 7);
          const checksToAdd = parseInt(session.metadata.checks || '1', 10);
          await run(
            `INSERT INTO photo_verification_usage (user_id, check_month, check_count, extra_checks, last_check_at)
             VALUES ($1, $2, 0, $3, NOW())
             ON CONFLICT (user_id, check_month)
             DO UPDATE SET extra_checks = COALESCE(photo_verification_usage.extra_checks, 0) + $3`,
            [userId, currentMonth, checksToAdd]
          );
          console.log(`User ${userId} purchased ${checksToAdd} extra photo check(s) (${session.metadata.package || 'single'}) for ${currentMonth}`);
          break;
        }

        if (userId) {
          // Determine tier from plan
          const tier = (plan && plan.startsWith('pro')) ? 'pro' : 'plus';

          await run(
            `UPDATE users SET subscription_tier = $1, stripe_subscription_id = $2, updated_at = NOW() WHERE id = $3`,
            [tier, session.subscription, userId]
          );
          console.log(`User ${userId} upgraded to ${tier} (plan: ${plan})`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        // Find user by stripe customer ID
        const user = await getOne('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);

        if (user) {
          if (subscription.status === 'active') {
            // Check which product they're subscribed to
            const item = subscription.items && subscription.items.data && subscription.items.data[0];
            const priceId = item && item.price && item.price.id;

            // Pro prices
            const proPrices = ['price_1TDXN5FaKA9n89CXeDxnAJMh', 'price_1TEdJfFaKA9n89CXZebr3UxW'];
            const tier = proPrices.includes(priceId) ? 'pro' : 'plus';

            await run(
              'UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2',
              [tier, user.id]
            );
            console.log(`User ${user.id} subscription updated to ${tier}`);
          } else if (subscription.status === 'past_due' || subscription.status === 'unpaid') {
            console.log(`User ${user.id} subscription is ${subscription.status}`);
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const user = await getOne('SELECT id FROM users WHERE stripe_customer_id = $1', [customerId]);

        if (user) {
          await run(
            "UPDATE users SET subscription_tier = 'free', stripe_subscription_id = NULL, updated_at = NOW() WHERE id = $1",
            [user.id]
          );
          console.log(`User ${user.id} subscription cancelled — downgraded to free`);
        }
        break;
      }

      default:
        // Unhandled event type
        break;
    }

    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook error:', err);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
};
