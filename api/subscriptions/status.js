const { authenticate, cors } = require('../_utils/auth');
const { stripe } = require('../_utils/stripe');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const tier = user.subscription_tier || 'free';

        if (tier === 'free' || !user.stripe_subscription_id) {
            return res.status(200).json({
                tier: 'free',
                status: null,
                current_period_end: null,
                cancel_at_period_end: false
            });
        }

        const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        return res.status(200).json({
            tier: tier,
            status: sub.status,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: sub.cancel_at_period_end
        });
    } catch (error) {
        console.error('Subscription status error:', error);
        return res.status(200).json({
            tier: user.subscription_tier || 'free',
            status: null,
            current_period_end: null,
            cancel_at_period_end: false
        });
    }
};
