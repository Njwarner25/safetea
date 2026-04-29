'use strict';

/**
 * POST /api/migrate-verification-deadline
 *
 * Adds verification_deadline TIMESTAMPTZ to users.
 * - Unverified existing users get NOW() + 90 days (grace period from launch).
 * - Verified users are left NULL (not needed — they're already past the gate).
 * Idempotent.
 */

const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_deadline TIMESTAMPTZ`;

    // Backfill: unverified users who don't yet have a deadline get 90 days from now
    const result = await sql`
      UPDATE users
      SET verification_deadline = NOW() + INTERVAL '90 days'
      WHERE (identity_verified IS NULL OR identity_verified = false)
        AND verification_deadline IS NULL
    `;

    return res.status(200).json({
      success: true,
      column_added: true,
      rows_backfilled: result.rowCount
    });
  } catch (err) {
    console.error('[migrate-verification-deadline]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
