const { getOne, run } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // In production: create a Yoti session and return the session URL/token
    // The mobile app opens a WebView with the Yoti SDK to complete identity verification
    // Yoti sends results via webhook to /api/auth/verify/callback

    if (process.env.YOTI_CLIENT_SDK_ID && process.env.YOTI_PEM_KEY) {
      // Production: Create Yoti session
      try {
        // Yoti Doc Scan session creation would go here
        // For now, return a pending status with instructions for the mobile SDK
        await run(
          "INSERT INTO verification_attempts (user_id, type, result, provider, session_id) VALUES ($1, $2, $3, $4, $5)",
          [user.id, 'identity', 'pending', 'yoti', 'yoti-session-pending']
        );

        return res.status(200).json({
          status: 'pending',
          message: 'Identity verification session created',
          provider: 'yoti',
          // The mobile app will use these to launch the Yoti SDK
          sdkId: process.env.YOTI_CLIENT_SDK_ID,
          // Session token would be returned from Yoti API
          instructions: 'Complete identity verification through the in-app flow'
        });
      } catch (yotiError) {
        console.error('Yoti session error:', yotiError);
        return res.status(500).json({ error: 'Failed to create verification session' });
      }
    } else {
      // DEV MODE: Auto-pass identity verification
      console.log(`[DEV] Auto-passing identity verification for user ${user.id}`);

      await run('UPDATE users SET identity_verified = true WHERE id = $1', [user.id]);

      await run(
        "INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, $2, $3, $4)",
        [user.id, 'identity', 'passed', 'dev-mode']
      );

      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [user.id]
      );
      if (updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [user.id]);
      }

      return res.status(200).json({
        status: 'passed',
        message: 'Identity verification complete (dev mode)',
        nextStep: !updated.gender_verified ? 'gender' : null
      });
    }
  } catch (error) {
    console.error('Identity verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
