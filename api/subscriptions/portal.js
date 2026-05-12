const { authenticate, cors } = require('../_utils/auth');
const { stripe, APP_URL } = require('../_utils/stripe');

// Create a Stripe Customer Portal session for the authenticated user.
// Required for Apple App Store Guideline 5.1.1 (subscription management UX)
// and the standard cancel/update/payment-method flow for web subscribers.
module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    if (!process.env.STRIPE_SECRET_KEY) {
        return res.status(500).json({ error: 'Stripe not configured — STRIPE_SECRET_KEY missing' });
    }

    if (!user.stripe_customer_id) {
        return res.status(400).json({
            error: 'No Stripe customer on file',
            detail: 'This account has no web subscription. Manage your plan on the platform where you subscribed.'
        });
    }

    try {
        const session = await stripe.billingPortal.sessions.create({
            customer: user.stripe_customer_id,
            return_url: APP_URL + '/subscription'
        });

        return res.status(200).json({ url: session.url });
    } catch (error) {
        console.error('Portal session error:', error);
        return res.status(500).json({ error: 'Failed to create portal session', details: error.message });
    }
};
