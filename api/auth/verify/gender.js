const { getOne, run } = require('../../_utils/db');
const { authenticate, cors, parseBody } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = await parseBody(req);
    const { gender } = body;

    if (!gender) {
      return res.status(400).json({ error: 'Gender selection is required' });
    }

    const allowedGenders = ['woman', 'trans_woman', 'non_binary'];
    if (!allowedGenders.includes(gender)) {
      await run(
        "INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, $2, $3, $4)",
        [user.id, 'gender', 'failed', 'self-attestation']
      );
      return res.status(403).json({
        error: 'SafeTea is currently available for women, trans women, and non-binary individuals.'
      });
    }

    // Store ONLY the boolean flag
    await run('UPDATE users SET gender_verified = true WHERE id = $1', [user.id]);

    await run(
      "INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, $2, $3, $4)",
      [user.id, 'gender', 'passed', 'self-attestation']
    );

    // Check if all steps are now complete
    const updated = await getOne(
      'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
      [user.id]
    );
    if (updated.age_verified && updated.identity_verified && updated.gender_verified) {
      await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [user.id]);
    }

    return res.status(200).json({
      status: 'passed',
      message: 'Gender verification complete',
      fullyVerified: updated.age_verified && updated.identity_verified && updated.gender_verified
    });
  } catch (error) {
    console.error('Gender verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
