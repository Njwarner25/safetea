const { query } = require('./_utils/db');

// Migration: Create redflag_scans table for logging AI Red Flag Scanner usage
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'POST only' });
  }

  try {
    await query(`
      CREATE TABLE IF NOT EXISTS redflag_scans (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        search_name TEXT NOT NULL,
        search_city TEXT NOT NULL,
        risk_score INTEGER DEFAULT 0,
        overall_risk TEXT DEFAULT 'low',
        posts_found INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);

    await query(`CREATE INDEX IF NOT EXISTS idx_redflag_scans_user ON redflag_scans(user_id)`);
    await query(`CREATE INDEX IF NOT EXISTS idx_redflag_scans_name ON redflag_scans(LOWER(search_name))`);
    await query(`CREATE INDEX IF NOT EXISTS idx_redflag_scans_created ON redflag_scans(created_at DESC)`);

    return res.status(200).json({ success: true, message: 'redflag_scans table created' });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message });
  }
};
