/**
 * POST /api/migrate-ban-system
 * Adds IP + device-fingerprint capture columns to users, and creates
 * banned_ips + banned_user_agents tables for the new admin ban flow.
 *
 * Auth: x-migrate-secret: MIGRATE_SECRET (header) or ?secret=MIGRATE_SECRET
 * Idempotent — safe to re-run.
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
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_ip VARCHAR(64)`;                done.push('users.registration_ip');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_user_agent TEXT`;                done.push('users.registration_user_agent');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS registration_device_hash VARCHAR(64)`;        done.push('users.registration_device_hash');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_ip VARCHAR(64)`;                   done.push('users.last_login_ip');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_user_agent TEXT`;                  done.push('users.last_login_user_agent');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_device_hash VARCHAR(64)`;          done.push('users.last_login_device_hash');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP`;                     done.push('users.last_login_at');
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0`;               done.push('users.login_count');

    await sql`CREATE INDEX IF NOT EXISTS idx_users_registration_ip ON users(registration_ip)`;         done.push('idx_users_registration_ip');
    await sql`CREATE INDEX IF NOT EXISTS idx_users_registration_device ON users(registration_device_hash)`; done.push('idx_users_registration_device');
    await sql`CREATE INDEX IF NOT EXISTS idx_users_identity_verified ON users(identity_verified)`;    done.push('idx_users_identity_verified');

    await sql`CREATE TABLE IF NOT EXISTS banned_ips (
      id SERIAL PRIMARY KEY,
      ip VARCHAR(64) UNIQUE NOT NULL,
      reason TEXT,
      banned_by INTEGER,
      banned_at TIMESTAMP DEFAULT NOW()
    )`;                                                                                                 done.push('banned_ips');

    await sql`CREATE TABLE IF NOT EXISTS banned_user_agents (
      id SERIAL PRIMARY KEY,
      device_hash VARCHAR(64) UNIQUE NOT NULL,
      user_agent_sample TEXT,
      reason TEXT,
      banned_by INTEGER,
      banned_at TIMESTAMP DEFAULT NOW()
    )`;                                                                                                 done.push('banned_user_agents');

    await sql`CREATE INDEX IF NOT EXISTS idx_banned_ips_ip ON banned_ips(ip)`;                          done.push('idx_banned_ips_ip');
    await sql`CREATE INDEX IF NOT EXISTS idx_banned_devices_hash ON banned_user_agents(device_hash)`;   done.push('idx_banned_devices_hash');

    return res.status(200).json({ success: true, applied: done });
  } catch (err) {
    console.error('[migrate-ban-system]', err && err.message);
    return res.status(500).json({ error: err && err.message, applied_before_failure: done });
  }
};
