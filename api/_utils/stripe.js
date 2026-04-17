const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

// Price IDs come from env exclusively — no hardcoded fallbacks so a missing
// yearly/pro env var fails loudly at checkout instead of silently charging
// the wrong amount.
const PRICES = {
    plus: process.env.STRIPE_PLUS_PRICE_ID,
    pro: process.env.STRIPE_PRO_PRICE_ID,
    plus_yearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID,
    pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID,
};

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://getsafetea.app';

module.exports = { stripe, PRICES, WEBHOOK_SECRET, APP_URL };
