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
    // ============================================================
    // ADMIN SYSTEM TABLES (v4 migration)
    // ============================================================

    // Audit trail for admin/moderator actions
    await sql`CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role VARCHAR(20) NOT NULL,
      action VARCHAR(100) NOT NULL,
      target_type VARCHAR(50) NOT NULL,
      target_id INTEGER,
      details JSONB DEFAULT '{}',
      ip_address VARCHAR(45),
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // User-submitted reports
    await sql`CREATE TABLE IF NOT EXISTS reports (
      id SERIAL PRIMARY KEY,
      reporter_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      reported_post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      reason VARCHAR(255) NOT NULL,
      details TEXT,
      status VARCHAR(20) DEFAULT 'pending',
      resolved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      resolved_at TIMESTAMP,
      resolution_note TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Moderator city assignments
    await sql`CREATE TABLE IF NOT EXISTS moderator_assignments (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      city VARCHAR(100) NOT NULL,
      assigned_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(user_id, city)
    )`;

    // User warnings
    await sql`CREATE TABLE IF NOT EXISTS user_warnings (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      issued_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reason TEXT NOT NULL,
      post_id INTEGER REFERENCES posts(id) ON DELETE SET NULL,
      created_at TIMESTAMP DEFAULT NOW()
    )`;

    // Add moderation columns to posts table
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderation_status VARCHAR(20) DEFAULT 'approved'`; } catch(e) {}
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderated_by INTEGER REFERENCES users(id)`; } catch(e) {}
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS report_count INTEGER DEFAULT 0`; } catch(e) {}
    try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`; } catch(e) {}

    // Add admin columns to users table
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20)`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_active TIMESTAMP`; } catch(e) {}
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0`; } catch(e) {}

    // Indexes
    try { await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_actor ON audit_logs(actor_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON audit_logs(target_type, target_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at DESC)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_reports_status ON reports(status)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_reports_reported_user ON reports(reported_user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_mod_assignments_user ON moderator_assignments(user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_mod_assignments_city ON moderator_assignments(city)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_posts_moderation ON posts(moderation_status)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_users_role ON users(role)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned)`; } catch(e) {}

    return res.status(200).json({
      message: 'Admin migration complete (v4: audit_logs, reports, moderator_assignments, user_warnings)'
    });
  } catch (error) {
    console.error('Admin migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
};
