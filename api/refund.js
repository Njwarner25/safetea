const { authenticate, cors, parseBody } = require('./_utils/auth');
const { getOne } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const stripeKey = process.env.STRIPE_SECRET_KEY;
  if (!stripeKey) return res.status(500).json({ error: 'Stripe not configured' });

  try {
    const stripe = require('stripe')(stripeKey);
    const body = await parseBody(req);
    const { reason } = body;

    if (!user.stripe_customer_id) {
      return res.status(400).json({ error: 'No payment history found' });
    }

    // Find the most recent charge for this customer
    const charges = await stripe.charges.list({
      customer: user.stripe_customer_id,
      limit: 1,
    });

    if (!charges.data || charges.data.length === 0) {
      return res.status(400).json({ error: 'No payments found to refund' });
    }

    const latestCharge = charges.data[0];
    const chargeDate = new Date(latestCharge.created * 1000);
    const now = new Date();
    const daysSinceCharge = (now - chargeDate) / (1000 * 60 * 60 * 24);

    // 7-day refund window
    if (daysSinceCharge > 7) {
      return res.status(400).json({
        error: 'Refund window has passed. Refunds are available within 7 days of your first payment.',
        daysSincePayment: Math.floor(daysSinceCharge),
      });
    }

    // Check if this charge was already refunded
    if (latestCharge.refunded) {
      return res.status(400).json({ error: 'This payment has already been refunded' });
    }

    // Process the refund
    const refund = await stripe.refunds.create({
      charge: latestCharge.id,
      reason: 'requested_by_customer',
      metadata: {
        safetea_user_id: String(user.id),
        user_reason: reason || 'not specified',
      },
    });

    return res.status(200).json({
      success: true,
      message: 'Refund processed successfully. It may take 5-10 business days to appear on your statement.',
      refundId: refund.id,
      amount: (refund.amount / 100).toFixed(2),
    });
  } catch (err) {
    console.error('Refund error:', err);
    return res.status(500).json({ error: 'Failed to process refund', details: err.message });
  }
};
