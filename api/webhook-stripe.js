// Legacy Stripe webhook path — delegates to the canonical handler at
// /api/webhooks/stripe so both URLs share a single code path regardless
// of which one is configured in the Stripe dashboard.

// CRITICAL: Vercel statically reads this export; disables body parsing so
// Stripe's signature-verification library sees the raw request body.
module.exports.config = { api: { bodyParser: false } };

const canonicalHandler = require('./webhooks/stripe');
module.exports = canonicalHandler;
