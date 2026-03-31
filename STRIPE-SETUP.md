# Stripe Environment Variable Setup

## Missing Variables

| Variable | Status | What It Is |
|---|---|---|
| `STRIPE_SECRET_KEY` | Present | Your Stripe API key |
| `STRIPE_PLUS_PRICE_ID` | **MISSING** | Price ID for SafeTea+ ($5.99/mo) |
| `STRIPE_PRO_PRICE_ID` | **MISSING** | Price ID for SafeTea Pro ($9.99/mo) |
| `STRIPE_WEBHOOK_SECRET` | **MISSING** | Signing secret for webhook verification |

## How to Find Your Price IDs

> **Important:** You need the **Price ID** (`price_...`), NOT the Product ID (`prod_...`).

### Known Product IDs
- SafeTea Pro: `prod_UBvD5hxoMcGdsB`

### Steps
1. Go to [Stripe Dashboard > Products](https://dashboard.stripe.com/products)
2. Click into **SafeTea+**
3. Scroll to the **Pricing** section
4. Find the row showing "$5.99 / month"
5. Copy the Price ID (starts with `price_...`) — this is your `STRIPE_PLUS_PRICE_ID`
6. Repeat for **SafeTea Pro** (`prod_UBvD5hxoMcGdsB`) to get `STRIPE_PRO_PRICE_ID`

## How to Find Your Webhook Secret

1. Go to [Stripe Dashboard > Developers > Webhooks](https://dashboard.stripe.com/webhooks)
2. Click your existing endpoint (URL should be `https://www.getsafetea.app/api/webhooks/stripe`)
3. Click **Reveal** next to the Signing secret
4. Copy the value (starts with `whsec_...`) — this is your `STRIPE_WEBHOOK_SECRET`

### Required Webhook Events
If creating a new endpoint, subscribe to:
- `checkout.session.completed`
- `customer.subscription.deleted`
- `customer.subscription.updated`

## Where to Add Them

Add all 3 variables to **Vercel** (both projects until consolidated):

1. Go to [Vercel Dashboard](https://vercel.com) > Project > **Settings** > **Environment Variables**
2. Add each variable for **Production**, **Preview**, and **Development**:

```
STRIPE_PLUS_PRICE_ID=price_xxxxx
STRIPE_PRO_PRICE_ID=price_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

3. **Redeploy** after adding (Settings > Deployments > Redeploy latest)

## Code References

These variables are used in:
- `api/_utils/stripe.js` — exports `PRICES.plus`, `PRICES.pro`, and `WEBHOOK_SECRET`
- `api/subscriptions/checkout.js` — creates Stripe Checkout sessions using the price IDs
- `api/webhooks/stripe.js` — verifies webhook signatures and handles subscription events
- `api/webhook-stripe.js` — legacy webhook handler (also uses `STRIPE_WEBHOOK_SECRET`)
