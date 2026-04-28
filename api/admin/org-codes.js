const { getOne, getAll, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

/**
 * /api/admin/org-codes
 *
 * GET  — List all org access codes with redemption stats
 * POST — Create a new org access code
 *
 * Admin-only endpoint.
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // ========== GET: List all org codes ==========
  if (req.method === 'GET') {
    try {
      const codes = await getAll(
        `SELECT
           oc.*,
           (SELECT COUNT(*) FROM org_code_redemptions WHERE org_code_id = oc.id) as total_redemptions
         FROM org_access_codes oc
         ORDER BY oc.created_at DESC`
      );

      return res.status(200).json({ codes: codes || [] });
    } catch (error) {
      console.error('[Admin OrgCodes] List error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  // ========== POST: Create a new org code ==========
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const {
      code,
      org_name,
      org_contact_email,
      duration_days = 90,
      max_redemptions = 500,
      expires_at,
      notes,
      grants_role
    } = body || {};

    if (!code || !org_name) {
      return res.status(400).json({ error: 'code and org_name are required' });
    }

    const cleanCode = code.trim().toUpperCase();

    // Validate code format: alphanumeric + hyphens, 4-30 chars
    if (!/^[A-Z0-9-]{4,30}$/.test(cleanCode)) {
      return res.status(400).json({
        error: 'Code must be 4-30 characters, alphanumeric and hyphens only'
      });
    }

    try {
      // Check for duplicates
      const existing = await getOne(
        'SELECT id FROM org_access_codes WHERE code = $1',
        [cleanCode]
      );
      if (existing) {
        return res.status(409).json({ error: 'This code already exists' });
      }

      // Validate grants_role if provided
      if (grants_role && !['moderator'].includes(grants_role)) {
        return res.status(400).json({ error: 'grants_role must be "moderator" or omitted' });
      }

      await run(
        `INSERT INTO org_access_codes (code, org_name, org_contact_email, duration_days, max_redemptions, expires_at, notes, grants_role)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          cleanCode,
          org_name.trim(),
          org_contact_email || null,
          duration_days,
          max_redemptions,
          expires_at || null,
          notes || null,
          grants_role || null
        ]
      );

      const newCode = await getOne(
        'SELECT * FROM org_access_codes WHERE code = $1',
        [cleanCode]
      );

      console.log(`[Admin OrgCodes] Created code "${cleanCode}" for ${org_name} (${duration_days} days, max ${max_redemptions} uses)`);

      return res.status(201).json({
        success: true,
        message: `Access code "${cleanCode}" created for ${org_name}`,
        code: newCode
      });
    } catch (error) {
      console.error('[Admin OrgCodes] Create error:', error);
      return res.status(500).json({ error: error.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
