/**
 * POST /api/webhooks/stripe — Handle Stripe webhook events
 *
 * Ported from server/routes/webhooks.js to Vercel serverless.
 * Stripe requires the raw request body for signature verification,
 * so we disable Vercel's automatic body parsing via the config export.
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY        – Stripe API secret key
 *   STRIPE_WEBHOOK_SECRET    – whsec_... signing secret from Stripe Dashboard
 */

const Stripe = require('stripe');
const { getOne, run } = require('../_utils/db');

/**
 * Collect the raw request body as a Buffer.
 * Vercel may hand us a Buffer, a string, or a readable stream.
 */
function getRawBody(req) {
  return new Promise((resolve, reject) => {
    // Already buffered by Vercel runtime
    if (Buffer.isBuffer(req.body)) return resolve(req.body);
    if (typeof req.body === 'string') return resolve(Buffer.from(req.body));

    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

async function handler(req, res) {
  // CORS — webhooks come from Stripe, not a browser, but keep for consistency
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Stripe-Signature');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY;
  const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;

  if (!STRIPE_SECRET_KEY || !WEBHOOK_SECRET) {
    console.error('[Webhook] Missing STRIPE_SECRET_KEY or STRIPE_WEBHOOK_SECRET env vars');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  const stripe = new Stripe(STRIPE_SECRET_KEY);

  try {
    // 1. Verify the webhook signature
    const rawBody = await getRawBody(req);
    const sig = req.headers['stripe-signature'];

    let event;
    try {
      event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
    } catch (err) {
      console.error('[Webhook] Signature verification failed:', err.message);
      return res.status(400).json({ error: 'Invalid signature' });
    }

    console.log(`[Webhook] Received event: ${event.type} (${event.id})`);

    // 2. Handle the event
    switch (event.type) {

      // ── Checkout completed (new subscription) ──
      case 'checkout.session.completed': {
        const session = event.data.object;
        const plan = session.metadata?.plan;
        const userId = session.metadata?.user_id;
        const subscriptionId = session.subscription;
        const customerId = session.customer;

        if (userId && plan) {
          await run(
            `UPDATE users
             SET subscription_tier = $1,
                 stripe_subscription_id = $2,
                 stripe_customer_id = $3,
                 trial_ends_at = NULL
             WHERE id = $4`,
            [plan, subscriptionId, customerId, parseInt(userId)]
          );
          console.log(`[Webhook] Checkout completed: user ${userId} upgraded to ${plan}`);
        } else {
          console.log(`[Webhook] Checkout completed but missing metadata: plan=${plan}, user_id=${userId}`);
        }
        break;
      }

      // ── Subscription deleted (cancellation) ──
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const subId = sub.id;
        const user = await getOne(
          'SELECT id FROM users WHERE stripe_subscription_id = $1',
          [subId]
        );
        if (user) {
          await run(
            `UPDATE users
             SET subscription_tier = 'free',
                 stripe_subscription_id = NULL
             WHERE id = $1`,
            [user.id]
          );
          console.log(`[Webhook] Subscription deleted: user ${user.id} downgraded to free`);
        } else {
          console.log(`[Webhook] Subscription deleted but no matching user for sub ${subId}`);
        }
        break;
      }

      // ── Subscription updated (status change, plan change) ──
      case 'customer.subscription.updated': {
        const sub = event.data.object;
        const subId = sub.id;
        const user = await getOne(
          'SELECT id, subscription_tier FROM users WHERE stripe_subscription_id = $1',
          [subId]
        );
        if (user) {
          if (sub.status === 'past_due' || sub.status === 'unpaid') {
            await run(
              `UPDATE users SET subscription_tier = 'free' WHERE id = $1`,
              [user.id]
            );
            console.log(`[Webhook] Subscription ${sub.status}: user ${user.id} downgraded to free`);
          } else if (sub.status === 'active') {
            const plan = sub.metadata?.plan || 'plus';
            await run(
              `UPDATE users SET subscription_tier = $1 WHERE id = $2`,
              [plan, user.id]
            );
            console.log(`[Webhook] Subscription active: user ${user.id} now on ${plan}`);
          }
        } else {
          console.log(`[Webhook] Subscription updated but no matching user for sub ${subId}`);
        }
        break;
      }

      // ── Invoice payment failed ──
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;
        const user = await getOne(
          'SELECT id, email FROM users WHERE stripe_customer_id = $1',
          [customerId]
        );
        if (user) {
          console.log(`[Webhook] Payment failed for user ${user.id} (${user.email})`);
          // Don't downgrade yet — Stripe retries. Downgrade happens on subscription.deleted
        }
        break;
      }

      default:
        console.log(`[Webhook] Unhandled event type: ${event.type}`);
    }

    // 3. Always acknowledge receipt
    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('[Webhook] Handler error:', error);
    return res.status(500).json({ error: 'Webhook handler failed' });
  }
}

// Export handler FIRST, then set config — if config is set before
// module.exports = handler, the assignment overwrites the config property.
module.exports = handler;
module.exports.config = { api: { bodyParser: false } };
