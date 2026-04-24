/**
 * POST /api/migrate-rival-watch
 *
 * Creates the rival_snapshots table used by the /api/cron/rival-watch
 * cron to detect when a competitor's site changes.
 *
 * Auth: x-migrate-secret: MIGRATE_SECRET  (or ?secret=)
 * Idempotent.
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
    await sql`CREATE TABLE IF NOT EXISTS rival_snapshots (
      id SERIAL PRIMARY KEY,
      url TEXT NOT NULL,
      fetched_at TIMESTAMP DEFAULT NOW(),
      status_code INTEGER,
      content_hash VARCHAR(64),
      content_length INTEGER,
      content_text TEXT,
      changed_from_previous BOOLEAN DEFAULT FALSE,
      diff_summary TEXT
    )`;                                                                  done.push('rival_snapshots');

    await sql`CREATE INDEX IF NOT EXISTS idx_rival_snapshots_url_time
              ON rival_snapshots(url, fetched_at DESC)`;                  done.push('idx_rival_snapshots_url_time');
    await sql`CREATE INDEX IF NOT EXISTS idx_rival_snapshots_hash
              ON rival_snapshots(content_hash)`;                          done.push('idx_rival_snapshots_hash');
    await sql`CREATE INDEX IF NOT EXISTS idx_rival_snapshots_changed
              ON rival_snapshots(changed_from_previous) WHERE changed_from_previous = TRUE`;
                                                                          done.push('idx_rival_snapshots_changed');

    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
