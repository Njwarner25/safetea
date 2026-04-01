const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Violations table — tracks all moderation violations
    await sql`CREATE TABLE IF NOT EXISTS violations (
      id SERIAL PRIMARY KEY,
      type VARCHAR(50) NOT NULL,
      accused_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      reported_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reported_by_system BOOLEAN DEFAULT false,
      evidence TEXT,
      context TEXT,
      photo_id INTEGER,
      status VARCHAR(30) DEFAULT 'pending_review',
      ai_decision JSONB,
      escalated_to_human BOOLEAN DEFAULT false,
      appeal_submitted BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW(),
      resolved_at TIMESTAMP
    )`;

    // Appeals table — one appeal per violation
    await sql`CREATE TABLE IF NOT EXISTS appeals (
      id SERIAL PRIMARY KEY,
      violation_id INTEGER NOT NULL REFERENCES violations(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      text TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'pending',
      ai_decision JSONB,
      submitted_at TIMESTAMP DEFAULT NOW(),
      reviewed_at TIMESTAMP,
      UNIQUE(violation_id)
    )`;

    // Moderation logs — audit trail for all moderation actions
    await sql`CREATE TABLE IF NOT EXISTS moderation_logs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action VARCHAR(50) NOT NULL,
      reason TEXT,
      category VARCHAR(50),
      details JSONB,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Add suspension/ban columns to users if they don't exist
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0`; } catch(e) {}

    // Add photo expiry columns
    try { await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS expires_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS expired_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'active'`; } catch(e) {}
    try { await sql`ALTER TABLE photos ADD COLUMN IF NOT EXISTS moderation_result JSONB`; } catch(e) {}

    // Add image_expired flag to posts
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS photo_status VARCHAR(20)`; } catch(e) {}

    // Indexes
    try { await sql`CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(accused_user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_violations_type ON violations(type)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_appeals_violation ON appeals(violation_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_appeals_user ON appeals(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_moderation_logs_user ON moderation_logs(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_photos_expires ON photos(expires_at)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_photos_status ON photos(status)`; } catch(e) {}

    return res.status(200).json({
      message: 'Moderation system migration complete',
      tables: ['violations', 'appeals', 'moderation_logs'],
      columns_added: ['users: suspended_at, suspension_ends_at, suspension_reason, violation_count, warning_count',
                       'photos: expires_at, expired_at, status, moderation_result',
                       'posts: photo_status']
    });
  } catch (error) {
    console.error('Moderation migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
};
