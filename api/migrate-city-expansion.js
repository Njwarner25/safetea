const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // City expansion requests — users request new cities
    await sql`CREATE TABLE IF NOT EXISTS city_requests (
      id SERIAL PRIMARY KEY,
      city_name VARCHAR(100) NOT NULL,
      state VARCHAR(50) NOT NULL,
      slug VARCHAR(100) UNIQUE NOT NULL,
      emoji VARCHAR(10) DEFAULT '🏙️',
      signup_count INTEGER DEFAULT 0,
      threshold INTEGER DEFAULT 100,
      status VARCHAR(20) DEFAULT 'pending',
      requested_by INTEGER REFERENCES users(id),
      unlocked_at TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // City signups — users sign up for a requested city's waitlist
    await sql`CREATE TABLE IF NOT EXISTS city_signups (
      id SERIAL PRIMARY KEY,
      city_request_id INTEGER NOT NULL REFERENCES city_requests(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      email VARCHAR(255) NOT NULL,
      referral_code VARCHAR(20),
      is_verified BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(city_request_id, email)
    )`;

    // Indexes
    try { await sql`CREATE INDEX IF NOT EXISTS idx_city_requests_slug ON city_requests(slug)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_city_requests_status ON city_requests(status)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_city_signups_city ON city_signups(city_request_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_city_signups_user ON city_signups(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_city_signups_referral ON city_signups(referral_code)`; } catch(e) {}

    return res.status(200).json({
      message: 'City expansion migration complete',
      tables: ['city_requests', 'city_signups']
    });
  } catch (error) {
    console.error('City expansion migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
};
