const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protect migration endpoint — consistent with other /api/migrate-*
  const secret = req.query.secret || req.headers['x-migrate-secret'];
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    // Add trust score columns to users
    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0`);
      results.push('Added trust_score column');
    } catch (e) { results.push('trust_score: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score_updated_at TIMESTAMPTZ`);
      results.push('Added trust_score_updated_at column');
    } catch (e) { results.push('trust_score_updated_at: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false`);
      results.push('Added phone_verified column');
    } catch (e) { results.push('phone_verified: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_verified BOOLEAN DEFAULT false`);
      results.push('Added didit_verified column');
    } catch (e) { results.push('didit_verified: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(255)`);
      results.push('Added didit_session_id column');
    } catch (e) { results.push('didit_session_id: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT false`);
      results.push('Added profile_complete column');
    } catch (e) { results.push('profile_complete: ' + e.message); }

    try {
      await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_under_review BOOLEAN DEFAULT false`);
      results.push('Added gender_under_review column');
    } catch (e) { results.push('gender_under_review: ' + e.message); }

    // Create trust_events audit log table
    await run(`CREATE TABLE IF NOT EXISTS trust_events (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      event_type VARCHAR(50) NOT NULL,
      delta INTEGER DEFAULT 0,
      score_before INTEGER DEFAULT 0,
      score_after INTEGER DEFAULT 0,
      reason TEXT,
      triggered_by VARCHAR(50),
      admin_id INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    results.push('Created trust_events table');

    // Create verification_requests table (admin-initiated re-verify)
    await run(`CREATE TABLE IF NOT EXISTS verification_requests (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      requested_by INTEGER REFERENCES users(id),
      reason TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    results.push('Created verification_requests table');

    // Index on trust_score for filtering
    try {
      await run(`CREATE INDEX IF NOT EXISTS idx_users_trust_score ON users(trust_score)`);
      results.push('Created trust_score index');
    } catch (e) { results.push('trust_score index: ' + e.message); }

    // Index on trust_events for lookups
    try {
      await run(`CREATE INDEX IF NOT EXISTS idx_trust_events_user ON trust_events(user_id, created_at DESC)`);
      results.push('Created trust_events index');
    } catch (e) { results.push('trust_events index: ' + e.message); }

    // Backfill: mark phone_verified for users who have a phone number
    const backfill = await run(
      `UPDATE users SET phone_verified = true WHERE phone IS NOT NULL AND LENGTH(phone) > 5 AND phone_verified = false`
    );
    results.push('Backfilled phone_verified: ' + (backfill.rowCount || 0) + ' users');

    // Backfill: mark profile_complete for users with bio + city + avatar
    const profileBackfill = await run(
      `UPDATE users SET profile_complete = true
       WHERE bio IS NOT NULL AND LENGTH(bio) > 0
         AND city IS NOT NULL AND LENGTH(city) > 0
         AND (avatar_url IS NOT NULL OR avatar_color IS NOT NULL)
         AND profile_complete = false`
    );
    results.push('Backfilled profile_complete: ' + (profileBackfill.rowCount || 0) + ' users');

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('Trust score migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message, results });
  }
};
