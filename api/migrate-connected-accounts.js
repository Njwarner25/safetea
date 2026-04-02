const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = [];

  try {
    // Create connected_accounts table for social media linking
    await run(`CREATE TABLE IF NOT EXISTS connected_accounts (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      platform VARCHAR(50) NOT NULL,
      platform_user_id VARCHAR(255),
      platform_username VARCHAR(255),
      account_age_months INTEGER,
      follower_count INTEGER,
      verified BOOLEAN DEFAULT false,
      flagged BOOLEAN DEFAULT false,
      ai_confidence FLOAT,
      ai_reason TEXT,
      connected_at TIMESTAMPTZ DEFAULT NOW(),
      verified_at TIMESTAMPTZ,
      UNIQUE(user_id, platform)
    )`);
    results.push('Created connected_accounts table');

    try {
      await run(`CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON connected_accounts(user_id)`);
      results.push('Created user index');
    } catch (e) { results.push('user index: ' + e.message); }

    try {
      await run(`CREATE INDEX IF NOT EXISTS idx_connected_accounts_verified ON connected_accounts(user_id, verified)`);
      results.push('Created verified index');
    } catch (e) { results.push('verified index: ' + e.message); }

    // Add extra_checks column to photo_verification_usage
    try {
      await run(`ALTER TABLE photo_verification_usage ADD COLUMN IF NOT EXISTS extra_checks INTEGER DEFAULT 0`);
      results.push('Added extra_checks to photo_verification_usage');
    } catch (e) { results.push('extra_checks: ' + e.message); }

    // Add sos_event_id to recording_sessions
    try {
      await run(`ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS sos_event_id INTEGER`);
      results.push('Added sos_event_id to recording_sessions');
    } catch (e) { results.push('sos_event_id: ' + e.message); }

    // Add last_update_sent_at to recording_sessions
    try {
      await run(`ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS last_update_sent_at TIMESTAMPTZ`);
      results.push('Added last_update_sent_at to recording_sessions');
    } catch (e) { results.push('last_update_sent_at: ' + e.message); }

    // Add verification_status to users (for reverification_required state)
    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_status VARCHAR(50) DEFAULT 'none'`);
      results.push('Added verification_status to users');
    } catch (e) { results.push('verification_status: ' + e.message); }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Connected accounts migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message, results });
  }
};
