const { getMany, run } = require('../_utils/db');
const { stripe, PRICES } = require('../_utils/stripe');
const { cors } = require('../_utils/auth');

// Reverse lookup: price ID -> tier name
function tierFromPriceId(priceId) {
  if (priceId === PRICES.plus) return 'plus';
  if (priceId === PRICES.pro) return 'pro';
  return null;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protect with MIGRATE_SECRET
  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const dryRun = req.query.dry === 'true';
  const results = [];
  const errors = [];
  let totalChecked = 0;
  let discrepancies = 0;

  try {
    // Step 1: Get all users with a stripe_subscription_id
    const users = await getMany(
      `SELECT id, email, subscription_tier, stripe_customer_id, stripe_subscription_id
       FROM users
       WHERE stripe_subscription_id IS NOT NULL`
    );

    totalChecked = users.length;

    for (const user of users) {
      try {
        // Small delay for rate limiting
        await new Promise(r => setTimeout(r, 200));

        let sub;
        try {
          sub = await stripe.subscriptions.retrieve(user.stripe_subscription_id);
        } catch (stripeErr) {
          if (stripeErr.statusCode === 404 || stripeErr.code === 'resource_missing') {
            // Subscription doesn't exist in Stripe
            if (user.subscription_tier !== 'free') {
              discrepancies++;
              const entry = {
                user_id: user.id,
                email: user.email,
                old_tier: user.subscription_tier,
                new_tier: 'free',
                reason: 'Stripe subscription not found (404) — downgrading to free'
              };
              results.push(entry);
              if (!dryRun) {
                await run(
                  'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
                  ['free', user.id]
                );
              }
            } else {
              // Tier is already free but has a stale subscription_id — clean it up
              discrepancies++;
              const entry = {
                user_id: user.id,
                email: user.email,
                old_tier: 'free',
                new_tier: 'free',
                reason: 'Stripe subscription not found — clearing stale stripe_subscription_id'
              };
              results.push(entry);
              if (!dryRun) {
                await run(
                  'UPDATE users SET stripe_subscription_id = NULL WHERE id = $1',
                  [user.id]
                );
              }
            }
            continue;
          }
          throw stripeErr; // Re-throw unexpected errors
        }

        const stripeStatus = sub.status; // active, canceled, incomplete_expired, unpaid, past_due, etc.
        const currentTier = (user.subscription_tier || 'free').toLowerCase();

        if (['active', 'trialing'].includes(stripeStatus)) {
          // Subscription is active — determine correct tier from price ID
          const priceId = sub.items?.data?.[0]?.price?.id;
          const correctTier = tierFromPriceId(priceId) || sub.metadata?.plan || 'plus';

          if (currentTier === 'free') {
            // DB says free but Stripe says active — upgrade
            discrepancies++;
            results.push({
              user_id: user.id,
              email: user.email,
              old_tier: 'free',
              new_tier: correctTier,
              reason: `Stripe subscription is ${stripeStatus} (price: ${priceId}) but DB says free`
            });
            if (!dryRun) {
              await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', [correctTier, user.id]);
            }
          } else if (currentTier !== correctTier) {
            // DB has wrong tier
            discrepancies++;
            results.push({
              user_id: user.id,
              email: user.email,
              old_tier: currentTier,
              new_tier: correctTier,
              reason: `Stripe price maps to ${correctTier} but DB says ${currentTier}`
            });
            if (!dryRun) {
              await run('UPDATE users SET subscription_tier = $1 WHERE id = $2', [correctTier, user.id]);
            }
          }
          // else: DB and Stripe agree, no action needed

        } else if (['canceled', 'incomplete_expired', 'unpaid', 'past_due'].includes(stripeStatus)) {
          // Subscription is not active — should be free
          if (currentTier !== 'free') {
            discrepancies++;
            results.push({
              user_id: user.id,
              email: user.email,
              old_tier: currentTier,
              new_tier: 'free',
              reason: `Stripe subscription status is "${stripeStatus}" — downgrading to free`
            });
            if (!dryRun) {
              await run(
                'UPDATE users SET subscription_tier = $1, stripe_subscription_id = NULL WHERE id = $2',
                ['free', user.id]
              );
            }
          } else {
            // Already free, just clean up the stale subscription_id
            discrepancies++;
            results.push({
              user_id: user.id,
              email: user.email,
              old_tier: 'free',
              new_tier: 'free',
              reason: `Stripe status "${stripeStatus}" — clearing stale stripe_subscription_id`
            });
            if (!dryRun) {
              await run('UPDATE users SET stripe_subscription_id = NULL WHERE id = $1', [user.id]);
            }
          }
        }
        // Other statuses (incomplete, paused) — leave as is for now

      } catch (userErr) {
        errors.push({
          user_id: user.id,
          email: user.email,
          error: userErr.message
        });
      }
    }

    return res.status(200).json({
      success: true,
      dry_run: dryRun,
      timestamp: new Date().toISOString(),
      summary: {
        total_users_checked: totalChecked,
        discrepancies_found: discrepancies,
        errors_count: errors.length
      },
      fixes: results,
      errors: errors
    });

  } catch (err) {
    return res.status(500).json({
      error: 'Sync failed',
      message: err.message,
      partial_results: results,
      errors: errors
    });
  }
};
