const { getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

/**
 * POST /api/org-code/redeem
 * Redeem an org access code to unlock Pro features for 90 days.
 *
 * Body: { code: "SAFEHOUSE2026" }
 *
 * Can be called:
 *  - During signup (after account creation, before onboarding completes)
 *  - By existing free-tier users who receive a code later
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Authentication required' });

  const body = await parseBody(req);
  const { code } = body || {};

  if (!code || !code.trim()) {
    return res.status(400).json({ error: 'Access code is required' });
  }

  const cleanCode = code.trim().toUpperCase();

  try {
    // 1. Find the org code
    const orgCode = await getOne(
      'SELECT * FROM org_access_codes WHERE code = $1',
      [cleanCode]
    );

    if (!orgCode) {
      return res.status(404).json({ error: 'Invalid access code' });
    }

    // 2. Check if code is active
    if (!orgCode.is_active) {
      return res.status(400).json({ error: 'This access code is no longer active' });
    }

    // 3. Check if code has expired
    if (orgCode.expires_at && new Date(orgCode.expires_at) < new Date()) {
      return res.status(400).json({ error: 'This access code has expired' });
    }

    // 4. Check max redemptions
    if (orgCode.max_redemptions && orgCode.redemption_count >= orgCode.max_redemptions) {
      return res.status(400).json({ error: 'This access code has reached its maximum number of uses' });
    }

    // 5. Check if user already redeemed this code
    const existingRedemption = await getOne(
      'SELECT * FROM org_code_redemptions WHERE org_code_id = $1 AND user_id = $2',
      [orgCode.id, user.id]
    );

    if (existingRedemption) {
      return res.status(400).json({
        error: 'You have already redeemed this access code',
        access_expires_at: existingRedemption.access_expires_at
      });
    }

    // 6. Check if user already has an active paid subscription (don't downgrade)
    if (user.subscription_tier === 'pro' && user.stripe_subscription_id) {
      return res.status(400).json({
        error: 'You already have an active Pro subscription'
      });
    }

    // 7. Calculate expiration
    const durationDays = orgCode.duration_days || 90;
    const accessExpiresAt = new Date();
    accessExpiresAt.setDate(accessExpiresAt.getDate() + durationDays);

    // 8. Record the redemption
    await run(
      `INSERT INTO org_code_redemptions (org_code_id, user_id, access_expires_at)
       VALUES ($1, $2, $3)`,
      [orgCode.id, user.id, accessExpiresAt.toISOString()]
    );

    // 9. Increment redemption count
    await run(
      'UPDATE org_access_codes SET redemption_count = redemption_count + 1, updated_at = NOW() WHERE id = $1',
      [orgCode.id]
    );

    // 10. Upgrade the user (and optionally grant moderator role)
    const grantRole = orgCode.grants_role; // e.g. 'moderator'
    if (grantRole && (grantRole === 'moderator' || grantRole === 'admin')) {
      await run(
        `UPDATE users
         SET subscription_tier = $1,
             org_code_id = $2,
             org_access_expires_at = $3,
             role = $4,
             updated_at = NOW()
         WHERE id = $5`,
        [orgCode.tier || 'pro', orgCode.id, accessExpiresAt.toISOString(), grantRole, user.id]
      );
    } else {
      await run(
        `UPDATE users
         SET subscription_tier = $1,
             org_code_id = $2,
             org_access_expires_at = $3,
             updated_at = NOW()
         WHERE id = $4`,
        [orgCode.tier || 'pro', orgCode.id, accessExpiresAt.toISOString(), user.id]
      );
    }

    console.log(`[OrgCode] User ${user.id} redeemed code "${cleanCode}" (org: ${orgCode.org_name}), Pro access until ${accessExpiresAt.toISOString()}`);

    return res.status(200).json({
      success: true,
      message: `Welcome! You now have full Pro access for ${durationDays} days, courtesy of ${orgCode.org_name}.`,
      subscription_tier: orgCode.tier || 'pro',
      access_expires_at: accessExpiresAt.toISOString(),
      org_name: orgCode.org_name
    });

  } catch (error) {
    console.error('[OrgCode] Redeem error:', error);
    return res.status(500).json({ error: 'Failed to redeem access code' });
  }
};
