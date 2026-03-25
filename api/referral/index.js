const crypto = require('crypto');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

// Generate a unique 8-char referral code
function generateCode() {
  return 'ST-' + crypto.randomBytes(4).toString('hex').toUpperCase().slice(0, 6);
}

// Reward tier definitions
const REWARD_TIERS = [
  { threshold: 3,  tier: 'premium', days: 30, label: '30 days SafeTea+' },
  { threshold: 10, tier: 'premium', days: 30, label: '30 days SafeTea Pro', pro: true },
  { threshold: 25, tier: 'premium', days: 90, label: '90 days SafeTea Pro', pro: true },
];

const MAX_LIFETIME_DAYS = 180; // 6-month cap

module.exports = async function handler(req, res) {
  cors(res);
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

      // Total free days used
      const totalDaysUsed = await getOne(
        'SELECT COALESCE(SUM(days_granted), 0) as total FROM referral_rewards WHERE user_id = $1',
        [user.id]
      );

      // Check promo status
      const promoConfig = await getOne(
        "SELECT value FROM referral_config WHERE key = 'promo_end_date'"
      );
      const promoEndDate = promoConfig ? promoConfig.value : '2026-06-22T23:59:59Z';
      const promoActive = new Date() < new Date(promoEndDate);

      // Determine next reward
      const count = parseInt(referralCount.count);
      let nextReward = null;
      for (const tier of REWARD_TIERS) {
        if (count < tier.threshold) {
          nextReward = { ...tier, remaining: tier.threshold - count };
          break;
        }
      }

      // Determine unlocked rewards
      const unlockedRewards = REWARD_TIERS.filter(t => count >= t.threshold);

      return res.status(200).json({
        success: true,
        referralCode: codeRow.code,
        shareUrl: `https://www.getsafetea.app/?ref=${codeRow.code}`,
        referralCount: count,
        referrals: referrals || [],
        activeRewards: activeRewards || [],
        totalDaysUsed: parseInt(totalDaysUsed.total),
        maxLifetimeDays: MAX_LIFETIME_DAYS,
        promoActive,
        promoEndDate,
        nextReward,
        unlockedRewards,
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
        const { threshold } = body;
        const tier = REWARD_TIERS.find(t => t.threshold === threshold);
        if (!tier) return res.status(400).json({ error: 'Invalid reward tier' });

        // Verify user has enough referrals
        const referralCount = await getOne(
          'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
          [user.id]
        );
        if (parseInt(referralCount.count) < tier.threshold) {
          return res.status(400).json({ error: 'Not enough referrals to claim this reward' });
        }

        // Check if already claimed this specific tier
        const existing = await getOne(
          "SELECT * FROM referral_rewards WHERE user_id = $1 AND reason = $2",
          [user.id, `referral_${tier.threshold}`]
        );
        if (existing) {
          return res.status(400).json({ error: 'Reward already claimed' });
        }

        // Check lifetime cap
        const totalDaysUsed = await getOne(
          'SELECT COALESCE(SUM(days_granted), 0) as total FROM referral_rewards WHERE user_id = $1',
          [user.id]
        );
        if (parseInt(totalDaysUsed.total) + tier.days > MAX_LIFETIME_DAYS) {
          return res.status(400).json({ error: 'Would exceed lifetime free day limit (180 days)' });
        }

        // Check promo is active
        const promoConfig = await getOne(
          "SELECT value FROM referral_config WHERE key = 'promo_end_date'"
        );
        if (promoConfig && new Date() > new Date(promoConfig.value)) {
          return res.status(400).json({ error: 'Referral promo has ended' });
        }

        // Grant the reward
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + tier.days);

        await run(
          `INSERT INTO referral_rewards (user_id, tier, days_granted, reason, expires_at)
           VALUES ($1, $2, $3, $4, $5)`,
          [user.id, tier.pro ? 'pro' : 'premium', tier.days, `referral_${tier.threshold}`, expiresAt.toISOString()]
        );

        // Upgrade user subscription tier temporarily
        const upgradeTier = tier.pro ? 'pro' : 'premium';
        const currentTier = user.subscription_tier || 'free';
        // Only upgrade if it's actually an upgrade
        const tierRank = { free: 0, premium: 1, pro: 2 };
        if ((tierRank[upgradeTier] || 0) > (tierRank[currentTier] || 0)) {
          await run(
            'UPDATE users SET subscription_tier = $1 WHERE id = $2',
            [upgradeTier, user.id]
          );
        }

        return res.status(200).json({
          success: true,
          reward: {
            tier: upgradeTier,
            days: tier.days,
            expiresAt: expiresAt.toISOString(),
            label: tier.label,
          },
          message: `Congrats! You've unlocked ${tier.label}!`,
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
