const { getOne, run } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { date_of_birth } = req.body || {};

    if (!date_of_birth) {
      return res.status(400).json({ error: 'Date of birth is required' });
    }

    // Calculate age — store NOTHING except the boolean result
    const dob = new Date(date_of_birth);
    const now = new Date();
    let age = now.getFullYear() - dob.getFullYear();
    const monthDiff = now.getMonth() - dob.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < dob.getDate())) {
      age--;
    }

    if (age < 18) {
      // Log attempt (no PII)
      await run(
        "INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, $2, $3, $4)",
        [user.id, 'age', 'failed', 'self-report']
      );
      return res.status(403).json({ error: 'You must be 18 or older to use SafeTea.' });
    }

    // Store ONLY the boolean flag — DOB is never saved
    await run('UPDATE users SET age_verified = true WHERE id = $1', [user.id]);

    // Log success (no PII stored)
    await run(
      "INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, $2, $3, $4)",
      [user.id, 'age', 'passed', 'self-report']
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
      message: 'Age verification complete',
      nextStep: !updated.identity_verified ? 'identity' : !updated.gender_verified ? 'gender' : null
    });
  } catch (error) {
    console.error('Age verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
