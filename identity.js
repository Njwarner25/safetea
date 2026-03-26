const https = require('https');
const { getOne, run } = require('../../_utils/db');
const { authenticate, cors } = require('../../_utils/auth');

// Stripe Identity API — create VerificationSession
async function createStripeVerificationSession(userId) {
  const secretKey = process.env.STRIPE_SECRET_KEY;

  const params = new URLSearchParams();
  params.append('type', 'document');
  params.append('metadata[user_id]', String(userId));
  params.append('options[document][require_matching_selfie]', 'true');

  const body = params.toString();

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.stripe.com',
      path: '/v1/identity/verification_sessions',
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + secretKey,
        'Content-Type': 'application/x-www-form-urlencoded',
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
            reject(new Error('Stripe Identity API error: ' + res.statusCode + ' - ' + data));
          }
        } catch (e) {
          reject(new Error('Failed to parse Stripe response: ' + data));
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

    // Check if Stripe is configured
    if (!process.env.STRIPE_SECRET_KEY) {
      console.error('CRITICAL: STRIPE_SECRET_KEY is not set. Identity verification unavailable.');
      return res.status(503).json({
        error: 'Identity verification is temporarily unavailable. Please try again later.',
        status: 'unavailable'
      });
    }

    // Create Stripe Identity verification session
    const session = await createStripeVerificationSession(user.id);

    // Store the session in DB for tracking
    await run(
      "INSERT INTO verification_attempts (user_id, type, result, provider, session_id) VALUES ($1, $2, $3, $4, $5)",
      [user.id, 'identity', 'pending', 'stripe_identity', session.id]
    );

    return res.status(200).json({
      status: 'pending',
      message: 'Identity verification session created',
      provider: 'stripe_identity',
      session_id: session.id,
      verification_url: session.url,
      client_secret: session.client_secret,
      instructions: 'Complete identity verification through the verification URL'
    });

  } catch (error) {
    console.error('Identity verification error:', error);
    return res.status(500).json({ error: 'Failed to create verification session' });
  }
};
