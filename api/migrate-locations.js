const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret || '';
  // SECURITY: MIGRATE_SECRET must be set in environment — no fallback
  if (!process.env.MIGRATE_SECRET) {
    console.error('CRITICAL: MIGRATE_SECRET is not set. Rejecting migration.');
    return res.status(500).json({ error: 'Migration not configured' });
  }
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Invalid secret' });
  }

  try {
    // Create date_locations table for live location tracking
    await run(`
      CREATE TABLE IF NOT EXISTS date_locations (
        id SERIAL PRIMARY KEY,
        checkout_id INTEGER NOT NULL UNIQUE REFERENCES date_checkouts(id) ON DELETE CASCADE,
        lat DECIMAL(10, 7) NOT NULL,
        lng DECIMAL(10, 7) NOT NULL,
        accuracy INTEGER,
        updated_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    // Index for fast lookups
    await run(`
      CREATE INDEX IF NOT EXISTS idx_date_locations_checkout ON date_locations(checkout_id)
    `);

    return res.status(200).json({
      success: true,
      message: 'date_locations table created successfully',
    });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message });
  }
};
