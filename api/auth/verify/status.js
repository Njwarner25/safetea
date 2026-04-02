const { getOne, getMany } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fullUser = await getOne(
      `SELECT age_verified, identity_verified, gender_verified, verified_at,
              gender_report_count, trust_score, didit_verified, phone_verified
       FROM users WHERE id = $1`,
      [user.id]
    );

    if (!fullUser) return res.status(404).json({ error: 'User not found' });

    const isFullyVerified = fullUser.age_verified && fullUser.identity_verified && fullUser.gender_verified;

    let nextStep = null;
    if (!fullUser.age_verified) nextStep = 'age';
    else if (!fullUser.identity_verified) nextStep = 'identity';
    else if (!fullUser.gender_verified) nextStep = 'gender';

    // Fetch connected social accounts
    let socialAccounts = [];
    let verifiedSocialCount = 0;
    try {
      socialAccounts = await getMany(
        `SELECT platform, platform_username, verified, flagged, ai_confidence
         FROM connected_accounts WHERE user_id = $1 ORDER BY created_at DESC`,
        [user.id]
      );
      verifiedSocialCount = socialAccounts.filter(a => a.verified && !a.flagged).length;
    } catch (e) { /* table may not exist yet */ }

    return res.status(200).json({
      verified: isFullyVerified,
      steps: {
        age: { completed: !!fullUser.age_verified, points: 0 },
        identity: { completed: !!fullUser.identity_verified, points: 60 },
        gender: { completed: !!fullUser.gender_verified, points: 0 },
        didit: { completed: !!fullUser.didit_verified, points: 30 },
        phone: { completed: !!fullUser.phone_verified, points: 10 },
        social: { completed: verifiedSocialCount > 0, count: verifiedSocialCount, max: 3, points: 20 }
      },
      socialAccounts,
      nextStep,
      verifiedAt: fullUser.verified_at || null,
      flagged: (fullUser.gender_report_count || 0) >= 3,
      trustScore: fullUser.trust_score || 0,
      diditVerified: !!fullUser.didit_verified,
      phoneVerified: !!fullUser.phone_verified
    });
  } catch (error) {
    console.error('Verification status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
