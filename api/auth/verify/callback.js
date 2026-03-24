const crypto = require('crypto');
const { getOne, run } = require('../../_utils/db');
const { cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Validate webhook signature (HMAC-SHA256)
    const signature = req.headers['x-yoti-signature'] || req.headers['x-webhook-signature'];
    const webhookSecret = process.env.YOTI_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        console.error('Webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const { session_id, user_id, result, checks } = req.body || {};

    if (!session_id || !result) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    // Find the verification attempt by session_id
    const attempt = await getOne(
      'SELECT * FROM verification_attempts WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [session_id]
    );

    const targetUserId = attempt ? attempt.user_id : user_id;

    if (!targetUserId) {
      console.error('Cannot find user for webhook session:', session_id);
      return res.status(400).json({ error: 'Cannot identify user for this session' });
    }

    if (result === 'passed' || result === 'approved') {
      // Update identity_verified
      await run('UPDATE users SET identity_verified = true WHERE id = $1', [targetUserId]);

      // Log success
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['passed', session_id]
      );

      // Check if age was also verified in this check
      if (checks && checks.age === true) {
        await run('UPDATE users SET age_verified = true WHERE id = $1', [targetUserId]);
      }

      // Check if all steps are now complete
      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [targetUserId]
      );
      if (updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [targetUserId]);
      }

      // Zero-retention: request Yoti to delete the verification data
      // In production, call Yoti's delete API here
      console.log(`[VERIFY] User ${targetUserId} passed identity verification. Requesting data deletion.`);

    } else {
      // Verification failed
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['failed', session_id]
      );
      console.log(`[VERIFY] User ${targetUserId} failed identity verification`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Verification callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
