const { getOne } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const fullUser = await getOne(
      'SELECT age_verified, identity_verified, gender_verified, verified_at, gender_report_count FROM users WHERE id = $1',
      [user.id]
    );

    if (!fullUser) return res.status(404).json({ error: 'User not found' });

    const isFullyVerified = fullUser.age_verified && fullUser.identity_verified && fullUser.gender_verified;

    let nextStep = null;
    if (!fullUser.age_verified) nextStep = 'age';
    else if (!fullUser.identity_verified) nextStep = 'identity';
    else if (!fullUser.gender_verified) nextStep = 'gender';

    return res.status(200).json({
      verified: isFullyVerified,
      steps: {
        age: { completed: !!fullUser.age_verified },
        identity: { completed: !!fullUser.identity_verified },
        gender: { completed: !!fullUser.gender_verified }
      },
      nextStep,
      verifiedAt: fullUser.verified_at || null,
      flagged: (fullUser.gender_report_count || 0) >= 3
    });
  } catch (error) {
    console.error('Verification status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
