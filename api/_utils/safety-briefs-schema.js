'use strict';

/**
 * Single source of truth for the `safety_briefs` table shape.
 *
 * The migrate endpoint (api/migrate-safety-briefs.js) provisions this plus
 * indexes; the write path (api/community/safety-report.js) and the admin
 * moderation path (api/admin/safety-reports.js) call this lazily so the
 * feature works even before the migration is run, and so the audit columns
 * backfill onto tables created before they existed.
 */
async function ensureSafetyBriefsSchema(run) {
  await run(`CREATE TABLE IF NOT EXISTS safety_briefs (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
    category VARCHAR(40) NOT NULL,
    note TEXT,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    city VARCHAR(120),
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    moderated_by INTEGER,
    moderated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
  // Backfill the moderation audit columns onto pre-existing tables.
  await run(`ALTER TABLE safety_briefs ADD COLUMN IF NOT EXISTS moderated_by INTEGER`);
  await run(`ALTER TABLE safety_briefs ADD COLUMN IF NOT EXISTS moderated_at TIMESTAMPTZ`);
}

module.exports = { ensureSafetyBriefsSchema };
