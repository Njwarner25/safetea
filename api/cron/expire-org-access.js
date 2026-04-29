const { getAll, run } = require('../_utils/db');

/**
 * POST /api/cron/expire-org-access
 * Runs daily to downgrade users whose org access code has expired.
 * Only downgrades users who don't have an active Stripe subscription.
 */
module.exports = async function handler(req, res) {
  // Verify cron secret
  const CRON_SECRET = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // Find users with expired org access who are still on a paid tier
    // but DON'T have an active Stripe subscription (those are paid customers)
    const expiredUsers = await getAll(
      `SELECT id, display_name, org_access_expires_at
       FROM users
       WHERE org_access_expires_at IS NOT NULL
         AND org_access_expires_at < NOW()
         AND subscription_tier != 'free'
         AND (stripe_subscription_id IS NULL OR stripe_subscription_id = '')`,
    );

    if (!expiredUsers || expiredUsers.length === 0) {
      console.log('[Cron] No expired org access codes to process');
      return res.status(200).json({ expired: 0 });
    }

    let downgraded = 0;
    for (const user of expiredUsers) {
      await run(
        `UPDATE users
         SET subscription_tier = 'free',
             org_code_id = NULL,
             org_access_expires_at = NULL,
             updated_at = NOW()
         WHERE id = $1`,
        [user.id]
      );
      downgraded++;
      console.log(`[Cron] Org access expired for user ${user.id} (${user.display_name}), downgraded to free`);
    }

    console.log(`[Cron] Expired org access: ${downgraded} users downgraded to free`);
    return res.status(200).json({ expired: downgraded });

  } catch (error) {
    console.error('[Cron] Expire org access error:', error);
    return res.status(500).json({ error: error.message });
  }
};
