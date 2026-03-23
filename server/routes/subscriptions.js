const express = require('express');
const router = express.Router();
const Stripe = require('stripe');
const { authenticate } = require('../middleware/auth');
const { query, getOne } = require('../db/database');

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
  plus: process.env.STRIPE_PLUS_PRICE_ID,
  pro: process.env.STRIPE_PRO_PRICE_ID
};

const APP_URL = process.env.APP_URL || 'https://getsafetea.app';

// POST /api/subscriptions/checkout — Create checkout session or upgrade existing subscription
router.post('/checkout', authenticate, async (req, res) => {
  try {
    const { plan } = req.body;

    if (!plan || !PRICES[plan]) {
      return res.status(400).json({ error: 'Invalid plan. Must be "plus" or "pro".' });
    }

    // Get or create Stripe customer
    let customerId = req.user.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email,
        metadata: { safetea_user_id: String(req.user.id) }
      });
      customerId = customer.id;
      await query('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, req.user.id]);
    }

    // If user already has an active subscription, update it directly
    if (req.user.stripe_subscription_id) {
      const sub = await stripe.subscriptions.retrieve(req.user.stripe_subscription_id);
      if (sub && sub.status === 'active') {
        await stripe.subscriptions.update(req.user.stripe_subscription_id, {
          items: [{
            id: sub.items.data[0].id,
            price: PRICES[plan]
          }],
          metadata: { plan: plan }
        });
        await query('UPDATE users SET subscription_tier = $1 WHERE id = $2', [plan, req.user.id]);
        return res.status(200).json({ url: APP_URL + '/dashboard.html?tab=profile&upgrade=success' });
      }
    }

    // Create new checkout session
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: PRICES[plan], quantity: 1 }],
      metadata: { plan: plan, user_id: String(req.user.id) },
      success_url: APP_URL + '/dashboard.html?tab=profile&upgrade=success',
      cancel_url: APP_URL + '/dashboard.html?tab=profile'
    });

    return res.status(200).json({ url: session.url });
  } catch (error) {
    console.error('Checkout error:', error);
    return res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// POST /api/subscriptions/cancel — Cancel subscription at end of billing period
router.post('/cancel', authenticate, async (req, res) => {
  try {
    if (!req.user.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to cancel' });
    }

    const sub = await stripe.subscriptions.update(req.user.stripe_subscription_id, {
      cancel_at_period_end: true
    });

    return res.status(200).json({
      message: 'Subscription will cancel at end of billing period',
      cancel_at_period_end: true,
      current_period_end: sub.current_period_end
    });
  } catch (error) {
    console.error('Cancel error:', error);
    return res.status(500).json({ error: 'Failed to cancel subscription' });
  }
});

// POST /api/subscriptions/refund — Refund latest charge and immediately cancel
router.post('/refund', authenticate, async (req, res) => {
  try {
    if (!req.user.stripe_subscription_id) {
      return res.status(400).json({ error: 'No active subscription to refund' });
    }

    // Get the latest paid invoice for this subscription
    const invoices = await stripe.invoices.list({
      subscription: req.user.stripe_subscription_id,
      limit: 1,
      status: 'paid'
    });

    if (!invoices.data.length) {
      return res.status(400).json({ error: 'No paid invoices found to refund' });
    }

    const latestInvoice = invoices.data[0];
    const chargeId = latestInvoice.charge;

    if (!chargeId) {
      return res.status(400).json({ error: 'No charge found on latest invoice' });
    }

    // Refund the latest charge
    await stripe.refunds.create({ charge: chargeId });

    // Immediately cancel the subscription
    await stripe.subscriptions.cancel(req.user.stripe_subscription_id);

    // Downgrade user to free
    await query(
      'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
      ['free', req.user.id]
    );

    return res.status(200).json({
      message: 'Refund issued and subscription cancelled',
      tier: 'free'
    });
  } catch (error) {
    console.error('Refund error:', error);
    return res.status(500).json({ error: 'Failed to process refund' });
  }
});

// GET /api/subscriptions/status — Get current subscription status
router.get('/status', authenticate, async (req, res) => {
  try {
    const tier = req.user.subscription_tier || 'free';

    if (tier === 'free' || !req.user.stripe_subscription_id) {
      return res.status(200).json({
        tier: 'free',
        status: null,
        current_period_end: null,
        cancel_at_period_end: false
      });
    }

    const sub = await stripe.subscriptions.retrieve(req.user.stripe_subscription_id);
    return res.status(200).json({
      tier: tier,
      status: sub.status,
      current_period_end: sub.current_period_end,
      cancel_at_period_end: sub.cancel_at_period_end
    });
  } catch (error) {
    console.error('Subscription status error:', error);
    // Gracefully return free tier on error
    return res.status(200).json({
      tier: req.user.subscription_tier || 'free',
      status: null,
      current_period_end: null,
      cancel_at_period_end: false
    });
  }
});

module.exports = router;
