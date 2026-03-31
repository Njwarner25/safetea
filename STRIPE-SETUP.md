# Stripe Environment Variable Setup

## All Variables

| Variable | Status | Value |
|---|---|---|
| `STRIPE_SECRET_KEY` | Present | (already configured) |
| `STRIPE_PLUS_PRICE_ID` | **Add to Vercel** | `price_1TDXLUFaKA9n89CXkfEotpfL` ($5.99/mo) |
| `STRIPE_PRO_PRICE_ID` | **Add to Vercel** | `price_1TDXN5FaKA9n89CXeDxnAJMh` ($9.99/mo) |
| `STRIPE_PLUS_YEARLY_PRICE_ID` | **Add to Vercel** | `price_1TEdLTFaKA9n89CX1xY0PG9H` ($49.99/yr) |
| `STRIPE_PRO_YEARLY_PRICE_ID` | **Add to Vercel** | `price_1TEdJfFaKA9n89CXZebr3UxW` ($89.99/yr) |
| `STRIPE_WEBHOOK_SECRET` | **Add to Vercel** | `whsec_CIi9SQrQ7SPb8249BZbyQIyVqytskwxt` |

## Price ID Reference

| Plan | Monthly | Yearly |
|---|---|---|
| SafeTea+ | `price_1TDXLUFaKA9n89CXkfEotpfL` ($5.99) | `price_1TEdLTFaKA9n89CX1xY0PG9H` ($49.99) |
| SafeTea Pro | `price_1TDXN5FaKA9n89CXeDxnAJMh` ($9.99) | `price_1TEdJfFaKA9n89CXZebr3UxW` ($89.99) |

### Product IDs
- SafeTea Pro: `prod_UBvD5hxoMcGdsB`

## Webhook Configuration

- **Endpoint URL**: `https://www.getsafetea.app/api/webhooks/stripe`
- **Signing Secret**: `whsec_CIi9SQrQ7SPb8249BZbyQIyVqytskwxt`
- **Events**:
  - `checkout.session.completed`
  - `customer.subscription.deleted`
  - `customer.subscription.updated`

## Vercel Setup

Add all variables to Vercel > Project > **Settings** > **Environment Variables** for all environments:

```
STRIPE_PLUS_PRICE_ID=price_1TDXLUFaKA9n89CXkfEotpfL
STRIPE_PRO_PRICE_ID=price_1TDXN5FaKA9n89CXeDxnAJMh
STRIPE_PLUS_YEARLY_PRICE_ID=price_1TEdLTFaKA9n89CX1xY0PG9H
STRIPE_PRO_YEARLY_PRICE_ID=price_1TEdJfFaKA9n89CXZebr3UxW
STRIPE_WEBHOOK_SECRET=whsec_CIi9SQrQ7SPb8249BZbyQIyVqytskwxt
```

**Redeploy** after adding (Settings > Deployments > Redeploy latest).

## Code References

- `api/_utils/stripe.js` — exports `PRICES` (plus, pro, plus_yearly, pro_yearly) and `WEBHOOK_SECRET`
- `api/subscriptions/checkout.js` — creates Stripe Checkout sessions, supports `billing: "yearly"` param
- `api/webhooks/stripe.js` — verifies webhook signatures and handles subscription lifecycle events
- `api/webhook-stripe.js` — legacy webhook handler
