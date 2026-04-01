const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  if (req.headers['x-migrate-secret'] !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Photo verification reports — stores analysis results (never images)
    await run(`
      CREATE TABLE IF NOT EXISTS photo_verification_reports (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        photo_count INTEGER NOT NULL DEFAULT 1,
        overall_risk VARCHAR(20) NOT NULL DEFAULT 'low',
        layers_json JSONB,
        recommendations_json JSONB,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    // Monthly usage tracking for rate limiting
    await run(`
      CREATE TABLE IF NOT EXISTS photo_verification_usage (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL,
        check_month VARCHAR(7) NOT NULL,
        check_count INTEGER NOT NULL DEFAULT 0,
        last_check_at TIMESTAMP DEFAULT NOW(),
        UNIQUE(user_id, check_month)
      )
    `);

    return res.status(200).json({ success: true, message: 'Photo verification tables created' });
  } catch (err) {
    console.error('Photo verify migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
