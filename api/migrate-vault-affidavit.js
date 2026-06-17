/**
 * POST /api/migrate-vault-affidavit
 *
 * Creates the `vault_affidavits` table — one Evidentiary Abuse Affidavit per
 * vault folder, stored encrypted under the folder DEK. See
 * services/vault/affidavit.js and api/vault/affidavit.js.
 *
 * Auth: x-migrate-secret: MIGRATE_SECRET. Idempotent. The load/save routes
 * also create the table lazily, so running this is optional.
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

  try {
    await sql`CREATE TABLE IF NOT EXISTS vault_affidavits (
      folder_id INTEGER PRIMARY KEY REFERENCES vault_folders(id) ON DELETE CASCADE,
      owner_user_id INTEGER NOT NULL,
      affidavit_enc TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`;
    return res.status(200).json({ success: true, applied: ['vault_affidavits'] });
  } catch (err) {
    return res.status(500).json({ error: err && err.message });
  }
};
