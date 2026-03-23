const { run, getOne } = require('../_utils/db');
const { stripe, WEBHOOK_SECRET } = require('../_utils/stripe');

module.exports.config = { api: { bodyParser: false } };

function getRawBody(req) {
    return new Promise(function(resolve, reject) {
        var chunks = [];
        req.on('data', function(chunk) { chunks.push(chunk); });
        req.on('end', function() { resolve(Buffer.concat(chunks)); });
        req.on('error', reject);
    });
}

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        const rawBody = await getRawBody(req);
        const sig = req.headers['stripe-signature'];

        var event;
        try {
            event = stripe.webhooks.constructEvent(rawBody, sig, WEBHOOK_SECRET);
        } catch (err) {
            console.error('Webhook signature verification failed:', err.message);
            return res.status(400).json({ error: 'Invalid signature' });
        }

        switch (event.type) {
            case 'checkout.session.completed': {
                const session = event.data.object;
                const plan = session.metadata.plan;
                const userId = session.metadata.user_id;
                const subscriptionId = session.subscription;
                const customerId = session.customer;

                if (userId && plan) {
                    await run(
                        'UPDATE users SET subscription_tier = $1, stripe_subscription_id = $2, stripe_customer_id = $3 WHERE id = $4',
                        [plan, subscriptionId, customerId, parseInt(userId)]
                    );
                }
                break;
            }

            case 'customer.subscription.deleted': {
                const sub = event.data.object;
                const subId = sub.id;
                // Find user by subscription ID and downgrade
                const user = await getOne('SELECT id FROM users WHERE stripe_subscription_id = $1', [subId]);
                if (user) {
                    await run(
                        'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
                        ['free', user.id]
                    );
                }
                break;
            }

            case 'customer.subscription.updated': {
                const sub = event.data.object;
                const subId = sub.id;
                const user = await getOne('SELECT id FROM users WHERE stripe_subscription_id = $1', [subId]);
                if (user) {
                    if (sub.status === 'past_due' || sub.status === 'unpaid') {
                        await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', ['free', user.id]);
                    } else if (sub.status === 'active') {
                        const plan = sub.metadata.plan || 'plus';
                        await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', [plan, user.id]);
                    }
                }
                break;
            }
        }

        return res.status(200).json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return res.status(500).json({ error: 'Webhook handler failed' });
    }
};
