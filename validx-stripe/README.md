# ValidX Stripe Quick Start

Get paid for experiments in under 15 minutes. This guide walks you through creating a Stripe account, generating payment links for your three tiers, and managing payments.

---

## Step 1 — Create Your Stripe Account

1. Go to **https://dashboard.stripe.com/register**
2. Enter your email, full name, and a password
3. Verify your email address
4. You'll land on the Stripe Dashboard in **test mode** (orange "Test mode" banner)

> You can accept real payments later by activating your account under **Settings > Account details**. For now, test mode lets you try everything with fake card numbers.

---

## Step 2 — Get Your API Keys

1. In the Stripe Dashboard, click **Developers** (top-right) or go to https://dashboard.stripe.com/test/apikeys
2. You'll see two keys:
   - **Publishable key** — starts with `pk_test_...` (used in frontend, safe to expose)
   - **Secret key** — starts with `sk_test_...` (used in backend, keep private)
3. Copy your **Secret key** — you'll need it in the next step

---

## Step 3 — Run the Setup Script

The setup script creates your three ValidX products and payment links automatically.

```bash
# 1. Install Stripe SDK
npm install stripe

# 2. Run the setup script with your secret key
node setup-stripe.js sk_test_YOUR_KEY_HERE
```

This creates:
| Product | Price | What it does |
|---------|-------|-------------|
| Quick Test | $250 | 10 testers, 48hr turnaround |
| Deep Dive | $500 | 25 testers, focus groups |
| Full Study | $750 | 50 testers, full analysis |

The script prints your three payment links. Share them anywhere — email, website, social media. Customers click, pay, done.

---

## Step 4 — Set Up Webhooks (So You Know When Someone Pays)

1. In the Stripe Dashboard, go to **Developers > Webhooks**
2. Click **Add endpoint**
3. Set the URL to: `https://YOUR-DOMAIN.com/api/stripe/webhook`
4. Select these events:
   - `checkout.session.completed`
   - `payment_intent.succeeded`
   - `charge.refunded`
5. Click **Add endpoint**
6. Copy the **Signing secret** (starts with `whsec_...`)
7. Add both keys to your `.env`:
   ```
   STRIPE_SECRET_KEY=sk_test_YOUR_KEY
   STRIPE_WEBHOOK_SECRET=whsec_YOUR_SECRET
   ```

---

## Step 5 — Go Live

When you're ready for real payments:

1. Go to **Settings > Account details** in Stripe Dashboard
2. Complete business verification (name, address, bank account)
3. Stripe will review and activate your account
4. Switch your API keys from `sk_test_...` to `sk_live_...`
5. Run the setup script again with your live key to create real payment links
6. Update your webhook endpoint with the live signing secret

---

## Test Card Numbers

While in test mode, use these fake cards:

| Card Number | Result |
|------------|--------|
| `4242 4242 4242 4242` | Successful payment |
| `4000 0000 0000 3220` | 3D Secure required |
| `4000 0000 0000 0002` | Card declined |

Use any future expiry date, any 3-digit CVC, and any ZIP code.

---

## Files in This Package

| File | Purpose |
|------|---------|
| `setup-stripe.js` | Creates products, prices, and payment links |
| `stripe-routes.js` | Express routes — webhook handler + payment API |
| `payment-dashboard.html` | Visual dashboard to manage payments and copy links |
| `.env.example` | Environment variables template |
| `README.md` | This guide |

---

## Quick Reference

- **Stripe Dashboard**: https://dashboard.stripe.com
- **Payment Links**: https://dashboard.stripe.com/payment-links
- **Webhooks**: https://dashboard.stripe.com/webhooks
- **Test Cards**: https://docs.stripe.com/testing#cards
- **API Docs**: https://docs.stripe.com/api
