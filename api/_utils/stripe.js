const Stripe = require('stripe');

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

const PRICES = {
    plus: process.env.STRIPE_PLUS_PRICE_ID || 'price_1TIe1vFaKA9n89CXWIoIq0Mf',
    pro: process.env.STRIPE_PRO_PRICE_ID || 'price_1TIe1vFaKA9n89CXWIoIq0Mf',
    plus_yearly: process.env.STRIPE_PLUS_YEARLY_PRICE_ID || 'price_1TEdJfFaKA9n89CXZebr3UxW',
    pro_yearly: process.env.STRIPE_PRO_YEARLY_PRICE_ID || 'price_1TEdJfFaKA9n89CXZebr3UxW',
};

const WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET;
const APP_URL = process.env.APP_URL || 'https://getsafetea.app';

module.exports = { stripe, PRICES, WEBHOOK_SECRET, APP_URL };
