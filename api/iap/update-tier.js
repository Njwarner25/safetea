// CLOSED: this endpoint previously accepted any authenticated user POSTing
// `{ tier: 'plus' | 'pro' | 'premium' }` and wrote it directly to the users
// table with no receipt validation — a five-minute self-upgrade exploit.
//
// Subscription tier changes must go through one of:
//   - api/iap/verify-receipt.js  (iOS — validates against Apple's server)
//   - api/webhook-stripe.js      (web/Android Stripe webhook)
//
// Leaving the route in place but rejecting all calls so no caller silently
// breaks; once we confirm no client paths hit it, the file can be deleted.

const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  return res.status(410).json({
    error: 'Endpoint removed',
    detail: 'Tier changes must come from validated Apple receipts or Stripe webhooks.',
  });
};
