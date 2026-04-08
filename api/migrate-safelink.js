const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await run(`CREATE TABLE IF NOT EXISTS safelink_sessions (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'active',
      label VARCHAR(120),
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      contacts_notified INTEGER DEFAULT 0,
      stopped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE TABLE IF NOT EXISTS safelink_locations (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) NOT NULL,
      latitude DECIMAL(10,8) NOT NULL,
      longitude DECIMAL(11,8) NOT NULL,
      accuracy_meters INTEGER,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    try { await run(`CREATE INDEX IF NOT EXISTS idx_safelink_locations_key ON safelink_locations(session_key, recorded_at)`); } catch(e) {}
    try { await run(`CREATE INDEX IF NOT EXISTS idx_safelink_user ON safelink_sessions(user_id, status)`); } catch(e) {}

    return res.status(200).json({ success: true, message: 'SafeLink tables created' });
  } catch (err) {
    console.error('SafeLink migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
