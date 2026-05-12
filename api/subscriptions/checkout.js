const { getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { stripe, PRICES, APP_URL } = require('../_utils/stripe');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe not configured — STRIPE_SECRET_KEY missing' });
    }

    try {
        const body = await parseBody(req);
        const { plan, interval, client } = body;

        // Support: plus (legacy 'pro' accepted and mapped to 'plus')
        const normalizedPlan = (plan === 'pro') ? 'plus' : plan;
        const priceKey = (interval === 'yearly') ? normalizedPlan + '_yearly' : normalizedPlan;

        if (normalizedPlan !== 'plus' || !PRICES[priceKey]) {
            return res.status(400).json({ error: 'Invalid plan. Must be "plus".' });
        }

        // Detect mobile callers so we can deep-link back into the native app instead of stranding them on the web dashboard.
        const ua = String(req.headers['user-agent'] || '');
        const clientHeader = String(req.headers['x-client'] || req.headers['x-safetea-client'] || '');
        const isAndroid =
            (typeof client === 'string' && client.toLowerCase() === 'android') ||
            /SafeTea-Android/i.test(ua) ||
            /SafeTea-Android/i.test(clientHeader);

        const webSuccessUrl = APP_URL + '/dashboard.html?tab=profile&upgrade=success';
        const webCancelUrl = APP_URL + '/dashboard.html?tab=profile';
        const successUrl = isAndroid
            ? 'safetea://subscription-success?session_id={CHECKOUT_SESSION_ID}'
            : webSuccessUrl;
        const cancelUrl = isAndroid
            ? 'safetea://subscription-cancelled'
            : webCancelUrl;

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
                    metadata: { plan: 'plus' }
                });
                await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', ['plus', user.id]);
                // In-app plan change has no checkout session, so always return the web confirmation URL even for Android — the Capacitor wrapper handles it.
                return res.status(200).json({ url: webSuccessUrl });
            }
        }

        const session = await stripe.checkout.sessions.create({
            customer: customerId,
            mode: 'subscription',
            payment_method_types: ['card'],
            line_items: [{ price: PRICES[priceKey], quantity: 1 }],
            metadata: { plan: 'plus', safetea_user_id: String(user.id), client: isAndroid ? 'android' : 'web' },
            success_url: successUrl,
            cancel_url: cancelUrl
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Checkout error:', error);
        return res.status(500).json({ error: 'Failed to create checkout session', details: error.message });
    }
};
