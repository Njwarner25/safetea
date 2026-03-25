const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  // SECURITY: Migration endpoints should not have permissive CORS
  res.setHeader('Access-Control-Allow-Origin', 'https://www.getsafetea.app');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Migrate-Secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // SECURITY: Require MIGRATE_SECRET — no fallback
  if (!process.env.MIGRATE_SECRET) {
    return res.status(500).json({ error: 'Migration not configured' });
  }
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Referral codes — each user gets a unique code
    await sql`CREATE TABLE IF NOT EXISTS referral_codes (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      code VARCHAR(20) UNIQUE NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Referral tracking — who referred whom
    await sql`CREATE TABLE IF NOT EXISTS referrals (
      id SERIAL PRIMARY KEY,
      referrer_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      referred_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      referral_code_id INTEGER NOT NULL REFERENCES referral_codes(id) ON DELETE CASCADE,
      status VARCHAR(20) DEFAULT 'signed_up',
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(referred_user_id)
    )`;

    // Referral rewards — tracks unlocked premium time
    await sql`CREATE TABLE IF NOT EXISTS referral_rewards (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      tier VARCHAR(20) NOT NULL,
      days_granted INTEGER NOT NULL,
      reason VARCHAR(100) NOT NULL,
      activated_at TIMESTAMP DEFAULT NOW(),
      expires_at TIMESTAMP NOT NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Referral program config — promo window
    await sql`CREATE TABLE IF NOT EXISTS referral_config (
      id SERIAL PRIMARY KEY,
      key VARCHAR(50) UNIQUE NOT NULL,
      value TEXT NOT NULL,
      updated_at TIMESTAMP DEFAULT NOW()
    )`;

    // Insert promo end date (90 days from now = June 22, 2026)
    await sql`INSERT INTO referral_config (key, value) VALUES ('promo_end_date', '2026-06-22T23:59:59Z')
      ON CONFLICT (key) DO NOTHING`;
    await sql`INSERT INTO referral_config (key, value) VALUES ('max_lifetime_free_days', '180')
      ON CONFLICT (key) DO NOTHING`;

    // Add referred_by column to users
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referred_by INTEGER REFERENCES users(id)`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS referral_code VARCHAR(20)`; } catch(e) {}

    // Indexes
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referral_codes_user ON referral_codes(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referral_codes_code ON referral_codes(code)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referrals_referred ON referrals(referred_user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referral_rewards_user ON referral_rewards(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_referral_rewards_expires ON referral_rewards(expires_at)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code)`; } catch(e) {}

    return res.status(200).json({
      message: 'Referral system migration complete',
      tables: ['referral_codes', 'referrals', 'referral_rewards', 'referral_config'],
      promo_ends: '2026-06-22'
    });
  } catch (error) {
    console.error('Referral migration error:', error);
    console.error('Referral migration error:', error);
    return res.status(500).json({ error: 'Migration failed' });
  }
};
