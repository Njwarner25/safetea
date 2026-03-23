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
            return res.status(400).json({ error: 'No active subscription to cancel' });
        }

        const sub = await stripe.subscriptions.update(user.stripe_subscription_id, {
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
};
