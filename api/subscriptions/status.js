const { authenticate, cors } = require('../_utils/auth');
const { stripe } = require('../_utils/stripe');
const { getOne } = require('../_utils/db');

// Yearly Stripe price IDs (used to label the plan interval for web subscribers).
const YEARLY_PRICE_IDS = new Set([
    'price_1TEdJfFaKA9n89CXZebr3UxW',
    'price_1TEdLTFaKA9n89CX1xY0PG9H',
    'price_1TI3jXFaKA9n89CX5viy9YKq',
]);

// Apple yearly product IDs.
const APPLE_YEARLY_PRODUCTS = new Set([
    'app.getsafetea.plus.annual',
    'safetea.plus.yearly',
]);

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Fetch the platform/product/expires fields that authenticate() doesn't include.
    let platform = null;
    let productId = null;
    let dbExpiresAt = null;
    try {
        const row = await getOne(
            'SELECT subscription_platform, subscription_product_id, subscription_expires_at FROM users WHERE id = $1',
            [user.id]
        );
        if (row) {
            platform = row.subscription_platform || null;
            productId = row.subscription_product_id || null;
            dbExpiresAt = row.subscription_expires_at || null;
        }
    } catch (e) {
        // Columns may not exist in all environments — fail soft.
        console.warn('subscriptions/status: could not load platform fields:', e && e.message);
    }

    try {
        const tier = user.subscription_tier || 'free';

        // Apple / non-Stripe subscribers: return the DB-tracked fields.
        if (platform && platform !== 'stripe' && !user.stripe_subscription_id) {
            const expiresUnix = dbExpiresAt ? Math.floor(new Date(dbExpiresAt).getTime() / 1000) : null;
            const interval = APPLE_YEARLY_PRODUCTS.has(productId) ? 'yearly' : 'monthly';
            return res.status(200).json({
                tier: tier,
                platform: platform,
                product_id: productId,
                interval: interval,
                status: tier === 'free' ? null : 'active',
                current_period_end: expiresUnix,
                cancel_at_period_end: false,
            });
        }

        if (tier === 'free' || !user.stripe_subscription_id) {
            return res.status(200).json({
                tier: 'free',
                platform: null,
                product_id: null,
                interval: null,
                status: null,
                current_period_end: null,
                cancel_at_period_end: false
            });
        }

        const sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        const stripePriceId = sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.id;
        const interval = (sub.items && sub.items.data && sub.items.data[0] && sub.items.data[0].price && sub.items.data[0].price.recurring && sub.items.data[0].price.recurring.interval)
            || (YEARLY_PRICE_IDS.has(stripePriceId) ? 'year' : 'month');
        return res.status(200).json({
            tier: tier,
            platform: platform || 'stripe',
            product_id: stripePriceId || null,
            interval: interval === 'year' || interval === 'yearly' ? 'yearly' : 'monthly',
            status: sub.status,
            current_period_end: sub.current_period_end,
            cancel_at_period_end: sub.cancel_at_period_end
        });
    } catch (error) {
        console.error('Subscription status error:', error);
        return res.status(200).json({
            tier: user.subscription_tier || 'free',
            platform: platform || null,
            product_id: productId || null,
            interval: null,
            status: null,
            current_period_end: dbExpiresAt ? Math.floor(new Date(dbExpiresAt).getTime() / 1000) : null,
            cancel_at_period_end: false
        });
    }
};
