const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const results = [];

  try {
    await run(`CREATE TABLE IF NOT EXISTS crime_alerts (
      id SERIAL PRIMARY KEY,
      city VARCHAR(50) NOT NULL,
      source_id VARCHAR(255) UNIQUE NOT NULL,
      crime_type VARCHAR(100) NOT NULL,
      description TEXT,
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      occurred_at TIMESTAMP NOT NULL,
      block_address VARCHAR(255),
      severity VARCHAR(20) DEFAULT 'medium',
      raw_category VARCHAR(255),
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    results.push('crime_alerts table created');

    await run(`CREATE INDEX IF NOT EXISTS idx_crime_alerts_city ON crime_alerts (city)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_crime_alerts_occurred ON crime_alerts (occurred_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_crime_alerts_type ON crime_alerts (crime_type)`);
    results.push('crime_alerts indexes created');

    await run(`CREATE TABLE IF NOT EXISTS user_watch_zones (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name VARCHAR(100),
      latitude DECIMAL(10, 7) NOT NULL,
      longitude DECIMAL(10, 7) NOT NULL,
      radius_miles DECIMAL(3, 1) DEFAULT 0.5,
      source VARCHAR(20) DEFAULT 'manual',
      is_active BOOLEAN DEFAULT true,
      created_at TIMESTAMP DEFAULT NOW(),
      updated_at TIMESTAMP DEFAULT NOW()
    )`);
    results.push('user_watch_zones table created');

    await run(`CREATE INDEX IF NOT EXISTS idx_watch_zones_user ON user_watch_zones (user_id)`);
    results.push('user_watch_zones indexes created');

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: 'Migration failed', details: err.message, results });
  }
};
