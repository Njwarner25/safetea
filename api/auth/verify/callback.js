const crypto = require('crypto');
const { parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { recalculateTrustScore } = require('../../_utils/trust-score');

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Signature-V2, X-Timestamp');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);

    // Verify webhook signature if secret is configured
    if (WEBHOOK_SECRET) {
      const signature = req.headers['x-signature-v2'];
      const timestamp = req.headers['x-timestamp'];

      if (!signature || !timestamp) {
        console.error('[Didit Callback] Missing signature or timestamp headers');
        return res.status(401).json({ error: 'Missing authentication headers' });
      }

      // Check timestamp is within 300 seconds
      const now = Math.floor(Date.now() / 1000);
      const ts = parseInt(timestamp);
      if (Math.abs(now - ts) > 300) {
        console.error('[Didit Callback] Timestamp too old:', now - ts, 'seconds');
        return res.status(401).json({ error: 'Timestamp expired' });
      }

      // Compute HMAC-SHA256 of sorted canonical JSON body
      const sortedBody = JSON.stringify(sortObject(body));
      const expectedSig = crypto
        .createHmac('sha256', WEBHOOK_SECRET)
        .update(sortedBody)
        .digest('hex');

      if (signature !== expectedSig) {
        console.error('[Didit Callback] Signature mismatch');
        return res.status(401).json({ error: 'Invalid signature' });
      }
    }

    const { session_id, status, vendor_data, decision, webhook_type } = body;

    if (!vendor_data) {
      console.error('[Didit Callback] No vendor_data (user ID) in payload');
      return res.status(400).json({ error: 'Missing vendor_data' });
    }

    const userId = parseInt(vendor_data);
    if (!userId || isNaN(userId)) {
      return res.status(400).json({ error: 'Invalid vendor_data' });
    }

    // Log the attempt
    try {
      await run(
        `INSERT INTO verification_attempts (user_id, type, result, provider)
         VALUES ($1, 'didit', $2, 'didit')`,
        [userId, status === 'Approved' ? 'passed' : 'failed']
      );
    } catch (e) { /* table may not exist */ }

    console.log('[Didit Callback] user=' + userId + ' status=' + status + ' session=' + session_id);

    if (status === 'Approved') {
      // Mark user as Didit-verified
      await run('UPDATE users SET didit_verified = true WHERE id = $1', [userId]);

      // Recalculate trust score
      await recalculateTrustScore(userId, 'didit_verified', 'didit_webhook');

      return res.status(200).json({ success: true, message: 'User verified via Didit' });
    } else {
      // Declined, In Review, or Abandoned — log but don't update verification status
      console.log('[Didit Callback] Non-approval status: ' + status + ' for user ' + userId);
      return res.status(200).json({ success: true, message: 'Webhook processed: ' + status });
    }
  } catch (err) {
    console.error('[Didit Callback] Error:', err);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
};

// Deep-sort object keys for canonical JSON
function sortObject(obj) {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObject);
  const sorted = {};
  Object.keys(obj).sort().forEach(function(key) {
    sorted[key] = sortObject(obj[key]);
  });
  return sorted;
}
