const { run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');
const { stripe } = require('../_utils/stripe');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
        if (!user.stripe_subscription_id) {
            return res.status(400).json({ error: 'No active subscription to refund' });
        }

        // Get the latest invoice for this subscription
        const invoices = await stripe.invoices.list({
            subscription: user.stripe_subscription_id,
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
        await stripe.subscriptions.cancel(user.stripe_subscription_id);

        // Downgrade user to free
        await run(
            'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
            ['free', user.id]
        );

        return res.status(200).json({
            message: 'Refund issued and subscription cancelled',
            tier: 'free'
        });
    } catch (error) {
        console.error('Refund error:', error);
        return res.status(500).json({ error: 'Failed to process refund' });
    }
};
