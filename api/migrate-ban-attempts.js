/**
 * POST /api/migrate-ban-attempts
 *
 * Creates banned_signup_attempts — the audit table for register / login
 * attempts that were rejected because the IP or device hash matched
 * the existing banned_ips / banned_user_agents lists.
 *
 * The nightly digest cron at /api/cron/ban-attempts-digest emails
 * njwarner25@gmail.com if any rows have notified_at IS NULL, then
 * stamps notified_at on the ones it just sent.
 *
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
    await sql`CREATE TABLE IF NOT EXISTS banned_signup_attempts (
      id SERIAL PRIMARY KEY,
      ip VARCHAR(64),
      device_hash VARCHAR(64),
      user_agent TEXT,
      attempted_email TEXT,
      action TEXT NOT NULL CHECK(action IN ('register','login')),
      blocked_reason TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      notified_at TIMESTAMPTZ
    )`;
    done.push('banned_signup_attempts');

    await sql`CREATE INDEX IF NOT EXISTS idx_ban_attempts_created ON banned_signup_attempts(created_at DESC)`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ban_attempts_unsent ON banned_signup_attempts(notified_at) WHERE notified_at IS NULL`;
    await sql`CREATE INDEX IF NOT EXISTS idx_ban_attempts_ip ON banned_signup_attempts(ip)`;
    done.push('indexes');

    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    console.error('[migrate-ban-attempts]', err && err.message);
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
