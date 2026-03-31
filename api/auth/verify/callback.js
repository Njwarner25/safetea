const crypto = require('crypto');
const { getOne, run } = require('../../_utils/db');
const { cors } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // GET = browser redirect after user completes Didit verification
  if (req.method === 'GET') {
    const appUrl = process.env.APP_URL || 'https://getsafetea.app';
    return res.status(200).send(`
      <!DOCTYPE html>
      <html><head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <title>Verification Complete – SafeTea</title>
        <style>
          body { font-family: -apple-system, sans-serif; background: #1A1A2E; color: #fff;
                 display: flex; justify-content: center; align-items: center; min-height: 100vh;
                 margin: 0; text-align: center; padding: 20px; }
          .card { max-width: 400px; }
          h1 { font-size: 48px; margin: 0; }
          h2 { font-size: 20px; margin: 16px 0 8px; }
          p { color: #A0AEC0; font-size: 14px; line-height: 1.5; }
          a { display: inline-block; margin-top: 20px; background: #E8513F; color: #fff;
              padding: 12px 32px; border-radius: 12px; text-decoration: none; font-weight: 700; }
        </style>
      </head><body>
        <div class="card">
          <h1>✅</h1>
          <h2>Verification Complete</h2>
          <p>You can close this window and return to the SafeTea app. Your verification status will update automatically.</p>
          <a href="${appUrl}">Back to SafeTea</a>
        </div>
      </body></html>
    `);
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Read raw body from request stream (before Vercel auto-parses it)
    // This is required for accurate HMAC signature verification
    const chunks = [];
    for await (const chunk of req) {
      chunks.push(chunk);
    }
    const rawBody = Buffer.concat(chunks).toString('utf8');
    const body = rawBody ? JSON.parse(rawBody) : req.body || {};

    // Validate Didit webhook signature
    const signature = req.headers['x-signature-v2'];
    const timestamp = req.headers['x-timestamp'];
    const webhookSecret = process.env.DIDIT_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      // Replay protection: reject if timestamp is >5 minutes old
      if (timestamp) {
        const age = Math.abs(Date.now() / 1000 - Number(timestamp));
        if (age > 300) {
          console.error('Webhook timestamp too old:', age, 'seconds');
          return res.status(401).json({ error: 'Webhook timestamp expired' });
        }
      }

      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');

      try {
        const isValid = crypto.timingSafeEqual(
          Buffer.from(expected),
          Buffer.from(signature)
        );
        if (!isValid) {
          console.error('Webhook signature mismatch');
          return res.status(401).json({ error: 'Invalid webhook signature' });
        }
      } catch {
        console.error('Webhook signature verification error');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const { session_id, status, vendor_data, decision } = body;

    if (!session_id || !status) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    // Find the user via vendor_data (user ID) or session lookup
    let targetUserId = vendor_data;

    if (!targetUserId) {
      const attempt = await getOne(
        'SELECT user_id FROM verification_attempts WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
        [session_id]
      );
      targetUserId = attempt ? attempt.user_id : null;
    }

    if (!targetUserId) {
      console.error('Cannot find user for Didit session:', session_id);
      return res.status(400).json({ error: 'Cannot identify user for this session' });
    }

    console.log(`[DIDIT] Session ${session_id} for user ${targetUserId}: ${status}`);

    if (status === 'Approved') {
      // Identity verified
      await run('UPDATE users SET identity_verified = true WHERE id = $1', [targetUserId]);
      await run(
        "UPDATE verification_attempts SET result = 'passed' WHERE session_id = $1",
        [session_id]
      );

      // If Didit extracted DOB and user is 18+, also mark age verified
      if (decision && decision.document && decision.document.date_of_birth) {
        const dob = new Date(decision.document.date_of_birth);
        const age = Math.floor((Date.now() - dob.getTime()) / (365.25 * 24 * 60 * 60 * 1000));
        if (age >= 18) {
          await run('UPDATE users SET age_verified = true WHERE id = $1', [targetUserId]);
        }
      }

      // Check if all verification steps are now complete
      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [targetUserId]
      );
      if (updated && updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [targetUserId]);
      }

      console.log(`[DIDIT] User ${targetUserId} identity APPROVED`);

    } else if (status === 'Declined') {
      await run(
        "UPDATE verification_attempts SET result = 'failed' WHERE session_id = $1",
        [session_id]
      );
      console.log(`[DIDIT] User ${targetUserId} identity DECLINED`);

    } else {
      // In Progress, In Review, Abandoned, Expired — log but don't change user state
      await run(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        [status.toLowerCase().replace(/\s+/g, '_'), session_id]
      );
      console.log(`[DIDIT] User ${targetUserId} session status: ${status}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Didit callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
