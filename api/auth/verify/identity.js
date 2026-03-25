const https = require('https');
const { getOne, run } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

// Didit API v3 — create identity verification session
async function createDiditSession(userId) {
  const apiKey = process.env.DIDIT_API_KEY;
  const workflowId = process.env.DIDIT_WORKFLOW_ID;

  const body = JSON.stringify({
    workflow_id: workflowId,
    vendor_data: String(userId),
    callback: 'https://www.getsafetea.app/api/auth/verify/callback',
    callback_method: 'POST',
    language: 'en'
  });

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'verification.didit.me',
      path: '/v3/session/',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'Content-Length': Buffer.byteLength(body)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error('Didit API error: ' + res.statusCode + ' - ' + data));
          }
        } catch (e) {
          reject(new Error('Failed to parse Didit response: ' + data));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Check if user is already verified
    const existing = await getOne(
      "SELECT id FROM verification_attempts WHERE user_id = $1 AND type = 'identity' AND result = 'approved' LIMIT 1",
      [user.id]
    );
    if (existing) {
      return res.status(200).json({
        status: 'already_verified',
        message: 'Your identity has already been verified'
      });
    }

    // Check if Didit is configured
    if (!process.env.DIDIT_API_KEY || !process.env.DIDIT_WORKFLOW_ID) {
      console.error('CRITICAL: DIDIT_API_KEY and DIDIT_WORKFLOW_ID are not set. Identity verification unavailable.');
      return res.status(503).json({
        error: 'Identity verification is temporarily unavailable. Please try again later.',
        status: 'unavailable'
      });
    }

    // Create Didit verification session
    const session = await createDiditSession(user.id);

    // Store the session in DB for tracking
    await run(
      "INSERT INTO verification_attempts (user_id, type, result, provider, session_id) VALUES ($1, $2, $3, $4, $5)",
      [user.id, 'identity', 'pending', 'didit', session.session_id]
    );

    return res.status(200).json({
      status: 'pending',
      message: 'Identity verification session created',
      provider: 'didit',
      session_id: session.session_id,
      verification_url: session.url || session.verification_url,
      session_token: session.session_token,
      instructions: 'Complete identity verification through the verification URL or in-app SDK'
    });

  } catch (error) {
    console.error('Identity verification error:', error);
    return res.status(500).json({ error: 'Failed to create verification session' });
  }
};
