const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.getsafetea.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migrate-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (!process.env.MIGRATE_SECRET) {
    return res.status(500).json({ error: 'Migration not configured' });
  }
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Add expired_processed column to referral_rewards
    try {
      await sql`ALTER TABLE referral_rewards ADD COLUMN IF NOT EXISTS expired_processed BOOLEAN DEFAULT FALSE`;
    } catch (e) {
      console.log('expired_processed column may already exist:', e.message);
    }

    // Add index for the cron query performance
    try {
      await sql`CREATE INDEX IF NOT EXISTS idx_referral_rewards_expired_processed
        ON referral_rewards(expires_at) WHERE expired_processed IS NOT TRUE`;
    } catch (e) {
      console.log('Index may already exist:', e.message);
    }

    return res.status(200).json({
      message: 'expire-referrals migration complete',
      changes: [
        'Added expired_processed BOOLEAN column to referral_rewards',
        'Added partial index on expires_at for unprocessed rewards',
      ],
    });
  } catch (error) {
    console.error('expire-referrals migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
};
