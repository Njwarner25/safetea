const crypto = require('crypto');
const { getOne, run } = require('../../_utils/db');
const { cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET = user browser redirect from Didit after completing verification
  // Redirect them back to the verify page where polling will pick up the result
  if (req.method === 'GET') {
    return res.writeHead(302, { Location: '/verify.html' }).end();
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // SECURITY: Require webhook signature validation
    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;
    if (!webhookSecret) {
      console.error('CRITICAL: DIDIT_WEBHOOK_SECRET is not set. Rejecting webhook.');
      return res.status(500).json({ error: 'Webhook verification not configured' });
    }

    // Didit sends X-Signature header for HMAC validation
    const signature = req.headers['x-signature'] || req.headers['x-signature-v2'] || req.headers['x-signature-simple'];
    const timestamp = req.headers['x-timestamp'];

    if (!signature) {
      console.error('Webhook received without signature header');
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    // Validate signature: HMAC-SHA256 of timestamp + body
    const rawBody = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const payload = timestamp ? (timestamp + '.' + rawBody) : rawBody;
    const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');

    try {
      if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'))) {
        console.error('Webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    } catch (sigErr) {
      console.error('Signature comparison error:', sigErr.message);
      return res.status(401).json({ error: 'Invalid webhook signature format' });
    }

    // Didit webhook payload
    const { session_id, status, vendor_data, decision } = req.body || {};

    if (!session_id || !status) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    // Find the verification attempt by session_id
    const attempt = await getOne(
      'SELECT * FROM verification_attempts WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [session_id]
    );

    // vendor_data contains the user ID we passed when creating the session
    const targetUserId = attempt ? attempt.user_id : (vendor_data ? parseInt(vendor_data) : null);

    if (!targetUserId) {
      console.error('Cannot find user for webhook session:', session_id);
      return res.status(400).json({ error: 'Cannot identify user for this session' });
    }

    // Didit statuses: Approved, Declined, In Review, Abandoned, Not Started
    if (status === 'Approved') {
      // Update identity_verified
      await run('UPDATE users SET identity_verified = true WHERE id = $1', [targetUserId]);

      // Log success
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['passed', session_id]
      );

      // If Didit extracted DOB and user is 18+, also mark age verified
      if (decision && decision.document && decision.document.date_of_birth) {
        const dob = new Date(decision.document.date_of_birth);
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age >= 18) {
          await run('UPDATE users SET age_verified = true WHERE id = $1', [targetUserId]);
        }
      }

      // Check if all steps are now complete
      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [targetUserId]
      );
      if (updated && updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [targetUserId]);
      }

      console.log(`[VERIFY] User ${targetUserId} passed Didit identity verification`);

    } else if (status === 'Declined') {
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['failed', session_id]
      );
      console.log(`[VERIFY] User ${targetUserId} declined by Didit identity verification`);

    } else if (status === 'Abandoned') {
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['abandoned', session_id]
      );
      console.log(`[VERIFY] User ${targetUserId} abandoned Didit identity verification`);

    } else {
      // In Review, Not Started, or other status — just log
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        [status.toLowerCase().replace(/\s+/g, '_'), session_id]
      );
      console.log(`[VERIFY] User ${targetUserId} Didit status: ${status}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Verification callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
