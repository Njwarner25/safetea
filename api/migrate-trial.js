/**
 * POST /api/migrate-trial
 * Adds SafeTea+ 7-day free-trial columns to the users table.
 * Auth: x-migrate-secret: MIGRATE_SECRET
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
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ`;
    done.push('users.trial_started_at');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ`;
    done.push('users.trial_ends_at');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT FALSE`;
    done.push('users.has_used_trial');
    await sql`CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users(trial_ends_at)`;
    done.push('idx_users_trial_ends_at');
    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
