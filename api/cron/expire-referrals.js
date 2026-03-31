/**
 * Vercel Cron Job: Expire referral-earned premium time
 *
 * Add to vercel.json "crons" array:
 * { "path": "/api/cron/expire-referrals", "schedule": "0 2 * * *" }
 *
 * Runs daily at 2 AM UTC.
 * Checks for expired referral rewards and downgrades users who:
 *   - Have NO active Stripe subscription (paying customers are never touched)
 *   - Have NO remaining non-expired referral rewards
 */

const { getMany, getOne, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');

// Tier hierarchy: free < plus < pro
const TIER_RANK = { free: 0, plus: 1, pro: 2 };

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SECURITY: Verify the cron request is coming from Vercel using CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (providedSecret !== cronSecret) {
    console.warn('Unauthorized cron request attempt to expire-referrals');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    expired_rewards_found: 0,
    users_downgraded: 0,
    users_skipped_stripe: 0,
    users_skipped_other_rewards: 0,
    users_tier_adjusted: 0,
    downgrades: [],
    errors: [],
  };

  try {
    // Step 1: Find all expired referral rewards that haven't been processed yet
    const expiredRewards = await getMany(
      `SELECT rr.id, rr.user_id, rr.tier, rr.days_granted, rr.reason, rr.expires_at
       FROM referral_rewards rr
       WHERE rr.expires_at < NOW()
         AND rr.expired_processed IS NOT TRUE
       ORDER BY rr.expires_at ASC`
    );

    results.expired_rewards_found = expiredRewards.length;

    if (expiredRewards.length === 0) {
      console.log('expire-referrals: No expired rewards to process.');
      return res.status(200).json({ success: true, message: 'No expired rewards to process', ...results });
    }

    // Step 2: Group expired rewards by user_id to process each user once
    const userIds = [...new Set(expiredRewards.map(r => r.user_id))];

    for (const userId of userIds) {
      try {
        // Get the user's current state
        const user = await getOne(
          `SELECT id, email, subscription_tier, stripe_subscription_id, stripe_customer_id
           FROM users WHERE id = $1`,
          [userId]
        );

        if (!user) {
          // User no longer exists — just mark rewards as processed
          const userExpiredIds = expiredRewards.filter(r => r.user_id === userId).map(r => r.id);
          await run(
            `UPDATE referral_rewards SET expired_processed = TRUE WHERE id = ANY($1::int[])`,
            [userExpiredIds]
          );
          continue;
        }

        // SAFETY CHECK: Never downgrade a paying customer
        if (user.stripe_subscription_id) {
          results.users_skipped_stripe++;
          console.log(`expire-referrals: Skipping user ${userId} — has active Stripe subscription`);
          // Still mark these rewards as processed so we don't re-check them
          const userExpiredIds = expiredRewards.filter(r => r.user_id === userId).map(r => r.id);
          await run(
            `UPDATE referral_rewards SET expired_processed = TRUE WHERE id = ANY($1::int[])`,
            [userExpiredIds]
          );
          continue;
        }

        // Check for remaining non-expired referral rewards
        const remainingRewards = await getMany(
          `SELECT tier FROM referral_rewards
           WHERE user_id = $1
             AND expires_at > NOW()
             AND (expired_processed IS NOT TRUE OR expired_processed IS NULL)`,
          [userId]
        );

        // Mark the expired rewards as processed
        const userExpiredIds = expiredRewards.filter(r => r.user_id === userId).map(r => r.id);
        await run(
          `UPDATE referral_rewards SET expired_processed = TRUE WHERE id = ANY($1::int[])`,
          [userExpiredIds]
        );

        if (remainingRewards.length > 0) {
          // User has other valid rewards — set tier to the highest remaining
          const highestRemaining = remainingRewards.reduce((best, r) => {
            return (TIER_RANK[r.tier] || 0) > (TIER_RANK[best] || 0) ? r.tier : best;
          }, 'free');

          const currentTier = user.subscription_tier || 'free';

          if (currentTier !== highestRemaining && (TIER_RANK[currentTier] || 0) > (TIER_RANK[highestRemaining] || 0)) {
            // Current tier is higher than what remaining rewards justify — adjust down
            await run(
              'UPDATE users SET subscription_tier = $1 WHERE id = $2',
              [highestRemaining, userId]
            );
            results.users_tier_adjusted++;
            results.downgrades.push({
              user_id: userId,
              email: user.email,
              old_tier: currentTier,
              new_tier: highestRemaining,
              reason: 'Adjusted to highest remaining referral reward tier',
            });
            console.log(`expire-referrals: Adjusted user ${userId} from ${currentTier} to ${highestRemaining}`);
          } else {
            results.users_skipped_other_rewards++;
            console.log(`expire-referrals: User ${userId} has ${remainingRewards.length} remaining reward(s) — keeping tier`);
          }
          continue;
        }

        // No Stripe subscription, no remaining rewards — downgrade to free
        const currentTier = user.subscription_tier || 'free';
        if (currentTier !== 'free') {
          await run(
            'UPDATE users SET subscription_tier = $1 WHERE id = $2',
            ['free', userId]
          );
          results.users_downgraded++;
          results.downgrades.push({
            user_id: userId,
            email: user.email,
            old_tier: currentTier,
            new_tier: 'free',
            reason: 'All referral rewards expired, no active Stripe subscription',
          });
          console.log(`expire-referrals: Downgraded user ${userId} from ${currentTier} to free`);
        }
        // If already free, nothing to do

      } catch (userErr) {
        console.error(`expire-referrals: Error processing user ${userId}:`, userErr);
        results.errors.push({
          user_id: userId,
          error: userErr.message,
        });
      }
    }

    console.log('expire-referrals: Complete.', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });

  } catch (err) {
    console.error('expire-referrals: Fatal error:', err);
    return res.status(500).json({
      error: 'Cron job failed',
      message: err.message,
      partial_results: results,
    });
  }
};
