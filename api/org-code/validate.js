const { getOne } = require('../_utils/db');
const { cors, parseBody } = require('../_utils/auth');

/**
 * POST /api/org-code/validate
 * Validate an org access code WITHOUT redeeming it.
 * Used during signup to show the user what they'll get before they finish creating their account.
 *
 * Body: { code: "SAFEHOUSE2026" }
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = await parseBody(req);
  const { code } = body || {};

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Access code is required' });
  }

  const cleanCode = code.trim().toUpperCase();

  try {
    const orgCode = await getOne(
      'SELECT code, org_name, tier, duration_days, max_redemptions, redemption_count, is_active, expires_at FROM org_access_codes WHERE code = $1',
      [cleanCode]
    );

    if (!orgCode) {
      return res.status(404).json({ valid: false, error: 'Invalid access code' });
    }

    if (!orgCode.is_active) {
      return res.status(400).json({ valid: false, error: 'This access code is no longer active' });
    }

    if (orgCode.expires_at && new Date(orgCode.expires_at) < new Date()) {
      return res.status(400).json({ valid: false, error: 'This access code has expired' });
    }

    if (orgCode.max_redemptions && orgCode.redemption_count >= orgCode.max_redemptions) {
      return res.status(400).json({ valid: false, error: 'This access code has reached its maximum number of uses' });
    }

    return res.status(200).json({
      valid: true,
      org_name: orgCode.org_name,
      tier: orgCode.tier || 'pro',
      duration_days: orgCode.duration_days || 90,
      message: `This code from ${orgCode.org_name} will give you full Pro access for ${orgCode.duration_days || 90} days.`
    });

  } catch (error) {
    console.error('[OrgCode] Validate error:', error);
    return res.status(500).json({ error: 'Failed to validate access code' });
  }
};
