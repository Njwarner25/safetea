const { getMany } = require('../_utils/db');
const { recalculateTrustScore } = require('../_utils/trust-score');

const CRON_SECRET = process.env.CRON_SECRET;

async function handler(req, res) {
  // Verify cron auth
  if (CRON_SECRET) {
    const auth = req.headers.authorization;
    if (auth !== 'Bearer ' + CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    // Get all active (non-banned) users in batches of 100
    let offset = 0;
    const batchSize = 100;
    let totalProcessed = 0;
    let errors = 0;

    while (true) {
      const users = await getMany(
        `SELECT id FROM users WHERE banned IS NOT TRUE ORDER BY id LIMIT $1 OFFSET $2`,
        [batchSize, offset]
      );

      if (!users || users.length === 0) break;

      for (const user of users) {
        try {
          await recalculateTrustScore(user.id, 'cron_recalc', 'cron');
          totalProcessed++;
        } catch (e) {
          console.error('[TrustCron] Failed for user ' + user.id + ':', e.message);
          errors++;
        }
      }

      offset += batchSize;

      // Safety: don't process more than 10,000 users in a single run
      if (offset >= 10000) break;
    }

    console.log('[TrustCron] Processed ' + totalProcessed + ' users, ' + errors + ' errors');
    return res.status(200).json({
      success: true,
      processed: totalProcessed,
      errors: errors
    });
  } catch (err) {
    console.error('[TrustCron] Error:', err);
    return res.status(500).json({ error: 'Cron job failed', details: err.message });
  }
};

module.exports = require('../_utils/cron-wrapper').withCronLogging('recalc-trust-scores', handler);
