#!/usr/bin/env node
/**
 * ValidX Stripe Setup Script
 *
 * Creates products, prices, and payment links for all three ValidX tiers.
 *
 * Usage:
 *   node setup-stripe.js sk_test_YOUR_SECRET_KEY
 *
 *   Or set STRIPE_SECRET_KEY in your .env file and just run:
 *   node setup-stripe.js
 */

require('dotenv').config();

const API_KEY = process.argv[2] || process.env.STRIPE_SECRET_KEY;

if (!API_KEY || API_KEY === 'sk_test_replace_me') {
  console.error('\n❌ Missing Stripe secret key!\n');
  console.error('Usage:');
  console.error('  node setup-stripe.js sk_test_YOUR_KEY_HERE\n');
  console.error('Get your key at: https://dashboard.stripe.com/test/apikeys\n');
  process.exit(1);
}

const stripe = require('stripe')(API_KEY);

// ── ValidX Tier Definitions ──────────────────────
const TIERS = [
  {
    id: 'quick-test',
    name: 'Quick Test',
    description: '10 real college-age testers evaluate your idea in 48 hours. Get quick validation before you invest more.',
    price: 25000,      // $250.00 in cents
    features: [
      '10 targeted testers',
      '48-hour turnaround',
      'Demographic matching',
      'Summary report with key insights',
    ],
    metadata: {
      tier: 'quick-test',
      reach: '10',
      turnaround: '48h',
    },
  },
  {
    id: 'deep-dive',
    name: 'Deep Dive',
    description: '25 testers with focus group-style feedback. Detailed analysis of your product-market fit.',
    price: 50000,      // $500.00 in cents
    features: [
      '25 targeted testers',
      '5-day turnaround',
      'Focus group questions',
      'Detailed analytics dashboard',
      'Sentiment analysis',
    ],
    metadata: {
      tier: 'deep-dive',
      reach: '25',
      turnaround: '5d',
    },
  },
  {
    id: 'full-study',
    name: 'Full Study',
    description: '50 testers in a comprehensive validation study. Complete market analysis and actionable recommendations.',
    price: 75000,      // $750.00 in cents
    features: [
      '50 targeted testers',
      '7-day turnaround',
      'Full market analysis',
      'Competitor benchmarking',
      'Video feedback sessions',
      'Executive summary report',
    ],
    metadata: {
      tier: 'full-study',
      reach: '50',
      turnaround: '7d',
    },
  },
];

// ── Main Setup ───────────────────────────────────
async function setup() {
  console.log('\n🚀 ValidX Stripe Setup\n');
  console.log('─'.repeat(50));

  const results = [];

  for (const tier of TIERS) {
    console.log(`\n📦 Creating "${tier.name}" ($${(tier.price / 100).toFixed(2)})...`);

    // 1. Create the Product
    const product = await stripe.products.create({
      name: `ValidX — ${tier.name}`,
      description: tier.description,
      metadata: tier.metadata,
      // Optional: add images when you have hosted URLs
      // images: ['https://validx.com/img/tier-quick-test.png'],
    });
    console.log(`   ✔ Product created: ${product.id}`);

    // 2. Create the Price
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: tier.price,
      currency: 'usd',
      metadata: tier.metadata,
    });
    console.log(`   ✔ Price created: ${price.id}`);

    // 3. Create the Payment Link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: tier.metadata,
      after_completion: {
        type: 'redirect',
        redirect: {
          url: `https://validx.com/app.html?payment=success&tier=${tier.id}`,
        },
      },
      // Collect customer email for follow-up
      custom_fields: [
        {
          key: 'company_name',
          label: { type: 'custom', custom: 'Company / Project Name' },
          type: 'text',
        },
      ],
      // Allow promo codes (create them in Stripe Dashboard > Coupons)
      allow_promotion_codes: true,
      // Collect billing address for tax purposes
      billing_address_collection: 'auto',
      // Automatic tax calculation (enable in Stripe Dashboard first)
      // automatic_tax: { enabled: true },
    });
    console.log(`   ✔ Payment Link created: ${paymentLink.url}`);

    results.push({
      tier: tier.id,
      name: tier.name,
      price: `$${(tier.price / 100).toFixed(2)}`,
      productId: product.id,
      priceId: price.id,
      paymentLinkId: paymentLink.id,
      paymentLinkUrl: paymentLink.url,
    });
  }

  // ── Print Summary ────────────────────────────
  console.log('\n' + '═'.repeat(50));
  console.log('✅ SETUP COMPLETE — Your Payment Links');
  console.log('═'.repeat(50));

  for (const r of results) {
    console.log(`\n  ${r.name} (${r.price})`);
    console.log(`  🔗 ${r.paymentLinkUrl}`);
  }

  console.log('\n' + '─'.repeat(50));
  console.log('📋 Add these to your .env file:\n');
  for (const r of results) {
    const key = r.tier.replace(/-/g, '_').toUpperCase();
    console.log(`STRIPE_PRICE_${key}=${r.priceId}`);
    console.log(`STRIPE_LINK_${key}=${r.paymentLinkUrl}`);
  }
  console.log(`\nSTRIPE_SECRET_KEY=${API_KEY}`);

  // Save results to a JSON file for the dashboard
  const fs = require('fs');
  const outputPath = require('path').join(__dirname, 'stripe-config.json');
  fs.writeFileSync(outputPath, JSON.stringify({
    created: new Date().toISOString(),
    mode: API_KEY.includes('_test_') ? 'test' : 'live',
    tiers: results,
  }, null, 2));
  console.log(`\n💾 Config saved to: ${outputPath}`);
  console.log('\n🎉 Share your payment links anywhere — customers click, pay, done!\n');
}

setup().catch(err => {
  console.error('\n❌ Setup failed:', err.message);
  if (err.type === 'StripeAuthenticationError') {
    console.error('   Your API key appears invalid. Double-check it at:');
    console.error('   https://dashboard.stripe.com/test/apikeys\n');
  }
  process.exit(1);
});
