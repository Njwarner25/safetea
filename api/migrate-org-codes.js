const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

/**
 * POST /api/migrate-org-codes
 * Creates the org_access_codes table and redemption tracking table.
 * Run once to set up the 90-day access code feature for DV organizations.
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const CRON_SECRET = process.env.CRON_SECRET;
  const authHeader = req.headers.authorization;
  if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  try {
    // Org access codes — one code per organization
    await run(`
      CREATE TABLE IF NOT EXISTS org_access_codes (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        code TEXT UNIQUE NOT NULL,
        org_name TEXT NOT NULL,
        org_contact_email TEXT,
        tier TEXT DEFAULT 'pro',
        duration_days INTEGER DEFAULT 90,
        max_redemptions INTEGER DEFAULT 500,
        redemption_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        expires_at TIMESTAMPTZ,
        grants_role TEXT DEFAULT NULL,
        notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Track individual redemptions
    await run(`
      CREATE TABLE IF NOT EXISTS org_code_redemptions (
        id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
        org_code_id TEXT NOT NULL REFERENCES org_access_codes(id),
        user_id TEXT NOT NULL REFERENCES users(id),
        redeemed_at TIMESTAMPTZ DEFAULT NOW(),
        access_expires_at TIMESTAMPTZ NOT NULL,
        UNIQUE(org_code_id, user_id)
      );
    `);

    // Add org_code_id to users table for quick lookups
    await run(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS org_code_id TEXT REFERENCES org_access_codes(id);
    `);

    // Add org_access_expires_at to users table
    await run(`
      ALTER TABLE users
      ADD COLUMN IF NOT EXISTS org_access_expires_at TIMESTAMPTZ;
    `);

    console.log('[Migration] org_access_codes tables created successfully');
    return res.status(200).json({ success: true, message: 'Org access code tables created' });
  } catch (error) {
    console.error('[Migration] Error:', error);
    return res.status(500).json({ error: error.message });
  }
};
