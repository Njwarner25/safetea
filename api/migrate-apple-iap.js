const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Add Apple IAP columns to users table
    await run(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS apple_product_id TEXT,
      ADD COLUMN IF NOT EXISTS apple_expires_at TIMESTAMPTZ
    `);

    return res.json({ success: true, message: 'Apple IAP columns added to users table' });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: err.message });
  }
};
