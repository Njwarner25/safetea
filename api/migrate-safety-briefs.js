/**
 * POST /api/migrate-safety-briefs
 *
 * Creates the `safety_briefs` table — the store behind community-reported
 * safety incidents that surface as layer-3 briefs in GET /api/ai/briefs.
 *
 * Each row is an experience-in-a-place report (never about a named person).
 * The briefs reader aggregates active rows within ~5km / 7 days into calm,
 * on-tone Alessia briefs. See api/_utils/safety-report-categories.js.
 *
 * Auth: x-migrate-secret: MIGRATE_SECRET (matches the other migrate-*).
 * Idempotent — safe to run repeatedly. The write path also creates the
 * table lazily, so running this is optional but adds the indexes.
 */

'use strict';

const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const done = [];
  try {
    await sql`CREATE TABLE IF NOT EXISTS safety_briefs (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      category VARCHAR(40) NOT NULL,
      note TEXT,
      latitude DOUBLE PRECISION NOT NULL,
      longitude DOUBLE PRECISION NOT NULL,
      city VARCHAR(120),
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    done.push('safety_briefs');

    // Geo + window scans (the briefs reader filters by bounding box, then
    // status + recency) and a per-user/day cap on the write path.
    await sql`CREATE INDEX IF NOT EXISTS idx_safety_briefs_geo ON safety_briefs(latitude, longitude)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_safety_briefs_recent ON safety_briefs(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_safety_briefs_status ON safety_briefs(status)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_safety_briefs_user ON safety_briefs(user_id)`;
    done.push('safety_briefs indexes');

    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
