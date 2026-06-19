/**
 * ValidX Stripe Routes
 *
 * Drop this into your Express backend:
 *   const stripeRoutes = require('./stripe-routes');
 *   app.use('/api/stripe', stripeRoutes);
 *
 * Required env vars:
 *   STRIPE_SECRET_KEY=sk_test_...
 *   STRIPE_WEBHOOK_SECRET=whsec_...
 */

const express = require('express');
const router = express.Router();

const STRIPE_KEY = process.env.STRIPE_SECRET_KEY;
if (!STRIPE_KEY || STRIPE_KEY === 'sk_test_replace_me') {
  console.warn('⚠ STRIPE_SECRET_KEY not set — Stripe routes will return errors');
}
const stripe = STRIPE_KEY ? require('stripe')(STRIPE_KEY) : null;

// ── Helper: require Stripe ───────────────────────
function requireStripe(req, res, next) {
  if (!stripe) {
    return res.status(503).json({ error: 'Stripe not configured. Set STRIPE_SECRET_KEY in .env' });
  }
  next();
}

// ══════════════════════════════════════════════════
// POST /api/stripe/create-checkout
// Creates a Checkout Session for a specific tier
// Body: { tier: 'quick-test' | 'deep-dive' | 'full-study', customerEmail?: string }
// ══════════════════════════════════════════════════
router.post('/create-checkout', requireStripe, async (req, res) => {
  try {
    const { tier, customerEmail, successUrl, cancelUrl } = req.body;

    // Load config to get the right price ID
    let config;
    try {
      config = require('./stripe-config.json');
    } catch {
      return res.status(500).json({ error: 'Run setup-stripe.js first to create products' });
    }

    const tierConfig = config.tiers.find(t => t.tier === tier);
    if (!tierConfig) {
      return res.status(400).json({ error: `Invalid tier: ${tier}. Use: quick-test, deep-dive, or full-study` });
    }

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [{ price: tierConfig.priceId, quantity: 1 }],
      customer_email: customerEmail || undefined,
      success_url: successUrl || `https://validx.com/app.html?payment=success&tier=${tier}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: cancelUrl || `https://validx.com/app.html?payment=cancelled`,
      metadata: { tier, source: 'validx-app' },
    });

    res.json({ url: session.url, sessionId: session.id });
  } catch (err) {
    console.error('Stripe checkout error:', err.message);
    res.status(500).json({ error: 'Failed to create checkout session' });
  }
});

// ══════════════════════════════════════════════════
// GET /api/stripe/payment-links
// Returns all active payment links
// ══════════════════════════════════════════════════
router.get('/payment-links', requireStripe, async (req, res) => {
  try {
    let config;
    try {
      config = require('./stripe-config.json');
    } catch {
      return res.status(500).json({ error: 'Run setup-stripe.js first' });
    }
    res.json({ mode: config.mode, tiers: config.tiers });
  } catch (err) {
    console.error('Payment links error:', err.message);
    res.status(500).json({ error: 'Failed to fetch payment links' });
  }
});

// ══════════════════════════════════════════════════
// GET /api/stripe/payments
// Lists recent payments (for the admin dashboard)
// Query: ?limit=25&starting_after=pi_xxx
// ══════════════════════════════════════════════════
router.get('/payments', requireStripe, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);
    const params = { limit };
    if (req.query.starting_after) {
      params.starting_after = req.query.starting_after;
    }

    const paymentIntents = await stripe.paymentIntents.list(params);

    const payments = paymentIntents.data.map(pi => ({
      id: pi.id,
      amount: pi.amount,
      currency: pi.currency,
      status: pi.status,
      tier: pi.metadata?.tier || 'unknown',
      customerEmail: pi.receipt_email || pi.metadata?.email || null,
      created: new Date(pi.created * 1000).toISOString(),
      description: pi.description,
    }));

    res.json({
      payments,
      hasMore: paymentIntents.has_more,
      count: payments.length,
    });
  } catch (err) {
    console.error('Payments list error:', err.message);
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// ══════════════════════════════════════════════════
// GET /api/stripe/balance
// Returns your Stripe account balance
// ══════════════════════════════════════════════════
router.get('/balance', requireStripe, async (req, res) => {
  try {
    const balance = await stripe.balance.retrieve();
    res.json({
      available: balance.available.map(b => ({
        amount: b.amount,
        currency: b.currency,
      })),
      pending: balance.pending.map(b => ({
        amount: b.amount,
        currency: b.currency,
      })),
    });
  } catch (err) {
    console.error('Balance error:', err.message);
    res.status(500).json({ error: 'Failed to fetch balance' });
  }
});

// ══════════════════════════════════════════════════
// POST /api/stripe/webhook
// Handles incoming Stripe webhook events
// IMPORTANT: This route must use raw body, not JSON
// ══════════════════════════════════════════════════
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.warn('⚠ STRIPE_WEBHOOK_SECRET not set — skipping signature verification');
    return res.status(400).json({ error: 'Webhook secret not configured' });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('⚠ Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }

  // ── Handle events ────────────────────────────
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object;
      console.log('✅ Payment received!');
      console.log(`   Tier: ${session.metadata?.tier || 'unknown'}`);
      console.log(`   Email: ${session.customer_details?.email || 'n/a'}`);
      console.log(`   Amount: $${(session.amount_total / 100).toFixed(2)}`);
      console.log(`   Session: ${session.id}`);

      // TODO: Activate the experiment in your database
      // const db = require('./lib/db');
      // db.prepare(`
      //   UPDATE experiments SET status = 'active', stripe_session_id = ?
      //   WHERE id = ? AND user_id = ?
      // `).run(session.id, session.metadata.experiment_id, session.metadata.user_id);

      break;
    }

    case 'payment_intent.succeeded': {
      const intent = event.data.object;
      console.log(`✅ Payment intent succeeded: ${intent.id} — $${(intent.amount / 100).toFixed(2)}`);
      break;
    }

    case 'charge.refunded': {
      const charge = event.data.object;
      console.log(`🔄 Refund processed: ${charge.id} — $${(charge.amount_refunded / 100).toFixed(2)}`);

      // TODO: Deactivate the experiment or flag for review
      break;
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object;
      console.log(`❌ Payment failed: ${intent.id} — ${intent.last_payment_error?.message || 'unknown error'}`);
      break;
    }

    default:
      console.log(`ℹ Unhandled event: ${event.type}`);
  }

  // Acknowledge receipt
  res.json({ received: true });
});

// ══════════════════════════════════════════════════
// POST /api/stripe/refund
// Refund a payment
// Body: { paymentIntentId: 'pi_xxx', amount?: 25000 }
// ══════════════════════════════════════════════════
router.post('/refund', requireStripe, async (req, res) => {
  try {
    const { paymentIntentId, amount } = req.body;
    if (!paymentIntentId) {
      return res.status(400).json({ error: 'paymentIntentId is required' });
    }

    const params = { payment_intent: paymentIntentId };
    if (amount) params.amount = amount; // partial refund in cents

    const refund = await stripe.refunds.create(params);
    console.log(`🔄 Refund created: ${refund.id} — $${(refund.amount / 100).toFixed(2)}`);

    res.json({
      id: refund.id,
      amount: refund.amount,
      status: refund.status,
      created: new Date(refund.created * 1000).toISOString(),
    });
  } catch (err) {
    console.error('Refund error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
