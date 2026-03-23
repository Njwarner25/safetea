const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { query, getOne } = require('../db/database');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

// POST /api/webhooks/stripe — Handle Stripe webhook events
// NOTE: This route uses express.raw() middleware, registered in index.js BEFORE express.json()
router.post('/stripe', async (req, res) => {
  try {
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(req.body, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('Webhook signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const plan = session.metadata.plan;
        const userId = session.metadata.user_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        if (userId && plan) {
          await query(
            'UPDATE users SET subscription_tier = $1, stripe_subscription_id = $2, stripe_customer_id = $3 WHERE id = $4',
            [plan, subscriptionId, customerId, parseInt(userId)]
          );
          console.log(`Checkout completed: user ${userId} upgraded to ${plan}`);
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const subId = sub.id;
        // Find user by subscription ID and downgrade
        const user = await getOne('SELECT id FROM users WHERE stripe_subscription_id = $1', [subId]);
        if (user) {
          await query(
            'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
            ['free', user.id]
          );
          console.log(`Subscription deleted: user ${user.id} downgraded to free`);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const subId = sub.id;
        const user = await getOne('SELECT id FROM users WHERE stripe_subscription_id = $1', [subId]);
        if (user) {
          if (sub.status === 'past_due' || sub.status === 'unpaid') {
            await query('UPDATE users SET subscription_tier = $1 WHERE id = $2', ['free', user.id]);
            console.log(`Subscription past_due/unpaid: user ${user.id} downgraded to free`);
          } else if (sub.status === 'active') {
            const plan = sub.metadata.plan || 'plus';
            await query('UPDATE users SET subscription_tier = $1 WHERE id = $2', [plan, user.id]);
            console.log(`Subscription updated: user ${user.id} now on ${plan}`);
          }
        }
        break;
      }
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Webhook error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
});

module.exports = router;
