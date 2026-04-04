const crypto = require('crypto');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

// Generate a unique 8-char referral code
function generateCode() {
  return 'ST-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// Single reward: 5 verified friends → 1 month free SafeTea+ (one-time)
const REWARD_TIERS = [
  { threshold: 5, tier: 'plus', days: 30, label: '1 month free SafeTea+' },
];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET — fetch referral dashboard data
  if (req.method === 'GET') {
    try {
      // Get or create referral code
      let codeRow = await getOne('SELECT * FROM referral_codes WHERE user_id = $1', [user.id]);
      if (!codeRow) {
        const code = generateCode();
        await run(
          'INSERT INTO referral_codes (user_id, code) VALUES ($1, $2)',
          [user.id, code]
        );
        codeRow = await getOne('SELECT * FROM referral_codes WHERE user_id = $1', [user.id]);
      }

      // Count referrals
      const referralCount = await getOne(
        'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
        [user.id]
      );

      // Get referral list with names
      const referrals = await getMany(
        `SELECT r.created_at, r.status, u.display_name, u.avatar_initial, u.avatar_color
         FROM referrals r
         LEFT JOIN users u ON r.referred_user_id = u.id
         WHERE r.referrer_id = $1
         ORDER BY r.created_at DESC
         LIMIT 50`,
        [user.id]
      );

      // Get active rewards
      const activeRewards = await getMany(
        "SELECT * FROM referral_rewards WHERE user_id = $1 AND expires_at > NOW() ORDER BY expires_at ASC",
        [user.id]
      );

      // Check if reward was already claimed (one-time only)
      const rewardClaimed = await getOne(
        "SELECT * FROM referral_rewards WHERE user_id = $1 AND reason = 'referral_5'",
        [user.id]
      );

      const count = parseInt(referralCount.count);
      const rewardReady = count >= 5 && !rewardClaimed;
      const rewardAlreadyClaimed = !!rewardClaimed;

      return res.status(200).json({
        success: true,
        referralCode: codeRow.code,
        shareUrl: `https://getsafetea.app/?ref=${codeRow.code}`,
        referralCount: count,
        referrals: referrals || [],
        activeRewards: activeRewards || [],
        rewardReady,
        rewardClaimed: rewardAlreadyClaimed,
        rewardExpiresAt: rewardClaimed ? rewardClaimed.expires_at : null,
        rewardTiers: REWARD_TIERS,
      });
    } catch (err) {
      console.error('Referral GET error:', err);
      return res.status(500).json({ error: 'Failed to fetch referral data' });
    }
  }

  // POST — claim a reward
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { action } = body;

      if (action === 'claim') {
        // One-time reward: 5 friends → 1 month free SafeTea+
        const tier = REWARD_TIERS[0];

        // Verify user has enough referrals
        const referralCount = await getOne(
          'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
          [user.id]
        );
        if (parseInt(referralCount.count) < tier.threshold) {
          return res.status(400).json({ error: 'You need 5 verified referrals to claim this reward' });
        }

        // Check if already claimed (one-time only)
        const existing = await getOne(
          "SELECT * FROM referral_rewards WHERE user_id = $1 AND reason = 'referral_5'",
          [user.id]
        );
        if (existing) {
          return res.status(400).json({ error: 'Reward already claimed — this is a one-time offer' });
        }

        // Grant 30 days free SafeTea+
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await run(
          `INSERT INTO referral_rewards (user_id, tier, days_granted, reason, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, 'plus', 30, 'referral_5', expiresAt.toISOString()]
        );

        // Upgrade user if currently free (if already paying, they keep paying — reward applies after)
        const currentTier = user.subscription_tier || 'free';
        if (currentTier === 'free') {
          await run(
            'UPDATE users SET subscription_tier = $1 WHERE id = $2',
            ['plus', user.id]
          );
        }

        return res.status(200).json({
          success: true,
          reward: {
            tier: 'plus',
            days: 30,
            expiresAt: expiresAt.toISOString(),
            label: '1 month free SafeTea+',
          },
          message: 'Congrats! You\'ve earned 1 month of free SafeTea+!',
        });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error('Referral POST error:', err);
      return res.status(500).json({ error: 'Failed to process referral action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
