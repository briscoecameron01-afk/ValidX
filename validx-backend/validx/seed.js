require('dotenv').config();
const db = require('./lib/db');
const { hashPassword } = require('./lib/auth');

console.log('Seeding ValidX database...');

// Clear non-admin data
db.exec(`
  DELETE FROM payouts;
  DELETE FROM submissions;
  DELETE FROM experiments;
  DELETE FROM users WHERE role != 'admin';
`);

// ── Businesses ─────────────────────────────────
const business1 = db.prepare(`
  INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, company, industry, company_size)
  VALUES ('business', 'jordan@acmelabs.com', ?, 'email', 'Jordan', 'Lee', 'Acme Labs', 'SaaS', '1-10')
`).run(hashPassword('password123')).lastInsertRowid;

const business2 = db.prepare(`
  INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, company, industry, company_size)
  VALUES ('business', 'sam@fitmeal.co', ?, 'email', 'Sam', 'Carter', 'FitMeal Co', 'Food & Beverage', '1-10')
`).run(hashPassword('password123')).lastInsertRowid;

// ── Testers ────────────────────────────────────
const tester1 = db.prepare(`
  INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, school, major, age)
  VALUES ('tester', 'alex@university.edu', ?, 'email', 'Alex', 'Morgan', 'State University', 'Business', 21)
`).run(hashPassword('password123')).lastInsertRowid;

const tester2 = db.prepare(`
  INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, school, major, age)
  VALUES ('tester', 'maya@campus.edu', ?, 'email', 'Maya', 'Kim', 'City College', 'Marketing', 20)
`).run(hashPassword('password123')).lastInsertRowid;

const tester3 = db.prepare(`
  INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, school, major, age)
  VALUES ('tester', 'riley@tech.edu', ?, 'email', 'Riley', 'Chen', 'Tech Institute', 'Design', 19)
`).run(hashPassword('password123')).lastInsertRowid;

// ── Experiments ────────────────────────────────
const exp1 = db.prepare(`
  INSERT INTO experiments (owner_id, title, assumption, type, tier, budget, reach, status, paid_with)
  VALUES (?, 'FitMeal Kits — Pricing', 'College students will pay $12/meal for healthy pre-portioned meal kits.', 'pricing', 'deep-dive', 89, 25, 'active', 'Stripe')
`).run(business2).lastInsertRowid;

const exp2 = db.prepare(`
  INSERT INTO experiments (owner_id, title, assumption, type, tier, budget, reach, status, paid_with)
  VALUES (?, 'LoopNote — Feature Priority', 'Voice notes with AI summary is the top-requested feature.', 'feature', 'full-study', 250, 50, 'active', 'Stripe')
`).run(business1).lastInsertRowid;

const exp3 = db.prepare(`
  INSERT INTO experiments (owner_id, title, assumption, type, tier, budget, reach, status, paid_with)
  VALUES (?, 'QuickShift — Channel Strategy', 'Gen Z will discover our app through TikTok, not Instagram.', 'channel', 'quick-test', 29, 10, 'active', 'PayPal')
`).run(business1).lastInsertRowid;

// ── Submissions ────────────────────────────────
db.prepare(`
  INSERT INTO submissions (experiment_id, tester_id, notes, files_json, payout, status)
  VALUES (?, ?, 'Surveyed 22 students in the dining hall. 14 said $10, only 6 said $12.', '[]', 27, 'approved')
`).run(exp1, tester1);

db.prepare(`
  INSERT INTO submissions (experiment_id, tester_id, notes, files_json, payout, status)
  VALUES (?, ?, 'Ran Instagram story test: 340 views, 47 clicks, 8 signups at $12.', '[]', 27, 'submitted')
`).run(exp1, tester2);

db.prepare(`
  INSERT INTO submissions (experiment_id, tester_id, notes, files_json, payout, status)
  VALUES (?, ?, 'Polled 30 friends - 80% would use voice notes with summary. Big feature request.', '[]', 75, 'approved')
`).run(exp2, tester3);

// ── A pending payout ───────────────────────────
db.prepare(`
  INSERT INTO payouts (tester_id, amount, method, status) VALUES (?, 25, 'stripe', 'pending')
`).run(tester1);

console.log('✔ Seeded 2 businesses, 3 testers, 3 experiments, 3 submissions, 1 payout');
console.log('   Login credentials: <email> / password123');
