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
                const plan = session.metadata && session.metadata.plan;
                const userId = session.metadata && session.metadata.user_id;
                const purchaseType = session.metadata && session.metadata.type;
                const subscriptionId = session.subscription;
                const customerId = session.customer;

                // Handle photo check extra purchase
                if (purchaseType === 'photo_check_extra' && userId) {
                    const currentMonth = new Date().toISOString().slice(0, 7);
                    await run(
                        `INSERT INTO photo_verification_usage (user_id, check_month, check_count, extra_checks, last_check_at)
                         VALUES ($1, $2, 0, 1, NOW())
                         ON CONFLICT (user_id, check_month)
                         DO UPDATE SET extra_checks = COALESCE(photo_verification_usage.extra_checks, 0) + 1`,
                        [parseInt(userId), currentMonth]
                    );
                    console.log('User ' + userId + ' purchased extra photo check');
                    break;
                }

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
