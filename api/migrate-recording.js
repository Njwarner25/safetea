const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await run(`CREATE TABLE IF NOT EXISTS recording_sessions (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'active',
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      contacts_notified INTEGER DEFAULT 0,
      escalated_at TIMESTAMPTZ,
      stopped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE TABLE IF NOT EXISTS recording_chunks (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) NOT NULL,
      chunk_number INTEGER NOT NULL,
      audio_data TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE INDEX IF NOT EXISTS idx_chunks_session ON recording_chunks(session_key, chunk_number)`);

    // Add transcript column
    try { await run(`ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcript TEXT`); } catch(e) {}

    return res.status(200).json({ success: true, message: 'Recording tables created' });
  } catch (err) {
    console.error('Recording migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
