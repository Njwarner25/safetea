const { getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { stripe, PRICES, APP_URL } = require('../_utils/stripe');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const body = await parseBody(req);
        const { plan, interval } = body;

        // Support: plus, pro, plus_yearly, pro_yearly
        const priceKey = (interval === 'yearly') ? plan + '_yearly' : plan;
        const basePlan = plan.replace('_yearly', '');

        if (!basePlan || !['plus', 'pro'].includes(basePlan) || !PRICES[priceKey]) {
            return res.status(400).json({ error: 'Invalid plan. Must be "plus" or "pro".' });
        }

        // Get or create Stripe customer
        let customerId = user.stripe_customer_id;
        if (!customerId) {
            const customer = await stripe.customers.create({
                email: user.email,
                metadata: { safetea_user_id: String(user.id) }
            });
            customerId = customer.id;
            await run('UPDATE users SET stripe_customer_id = $1 WHERE id = $2', [customerId, user.id]);
        }

        // If user already has a subscription, create a billing portal session to change plan
        if (user.stripe_subscription_id) {
            const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
            if (sub && sub.status === 'active') {
                // Update existing subscription to new price
                await stripe.subscriptions.update(user.stripe_subscription_id, {
                    items: [{
                        id: sub.items.data[0].id,
                        price: PRICES[priceKey]
                    }],
                    metadata: { plan: basePlan }
                });
                await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', [basePlan, user.id]);
                return res.status(200).json({ url: APP_URL + '/dashboard.html?tab=profile&upgrade=success' });
            }
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: PRICES[priceKey], quantity: 1 }],
            metadata: { plan: basePlan, user_id: String(user.id) },
            success_url: APP_URL + '/dashboard.html?tab=profile&upgrade=success',
            cancel_url: APP_URL + '/dashboard.html?tab=profile'
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({ error: 'Failed to create checkout session' });
    }
};
