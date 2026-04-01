const { run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  const { cors } = require('../_utils/auth');
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await run(`CREATE TABLE IF NOT EXISTS sos_events (
      id SERIAL PRIMARY KEY,
      checkout_id INTEGER REFERENCES date_checkouts(id),
      user_id INTEGER REFERENCES users(id),
      type VARCHAR(50) NOT NULL,
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      resolved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    return res.status(200).json({ success: true, message: 'sos_events table created' });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
