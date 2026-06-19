const express = require('express');
const db = require('../lib/db');
const { hashPassword, verifyPassword, signToken, sanitizeUser } = require('../lib/auth');
const { authRequired } = require('../middleware/authRequired');

const router = express.Router();

// ── Register ───────────────────────────────────────────
router.post('/register', (req, res) => {
  const b = req.body || {};
  const { role, email, password, firstName, lastName } = b;

  if (!['business', 'tester'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (!email || !email.includes('@')) return res.status(400).json({ error: 'Invalid email' });
  if (!password || password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
  if (!firstName || !lastName) return res.status(400).json({ error: 'Name required' });

  if (role === 'business' && !b.company) return res.status(400).json({ error: 'Company name required' });
  if (role === 'tester') {
    if (!b.school) return res.status(400).json({ error: 'School required' });
    if (!b.age || Number(b.age) < 18) return res.status(400).json({ error: 'Must be 18 or older' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Email already registered' });

  const info = db.prepare(`
    INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name, company, industry, company_size, school, major, age)
    VALUES (?, ?, ?, 'email', ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    role, email, hashPassword(password), firstName, lastName,
    b.company || null, b.industry || null, b.companySize || null,
    b.school || null, b.major || null, b.age ? Number(b.age) : null,
  );

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  const token = signToken(user);
  res.status(201).json({ token, user: sanitizeUser(user) });
});

// ── Login ──────────────────────────────────────────────
router.post('/login', (req, res) => {
  const { email, password, role } = req.body || {};
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  if (role && user.role !== role) {
    return res.status(403).json({ error: `This account is registered as a ${user.role}` });
  }
  if (user.status !== 'active') return res.status(403).json({ error: `Account ${user.status}` });

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// ── Google OAuth ──────────────────────────────────────
// In production: verify the Google ID token with google-auth-library.
// This endpoint accepts a pre-verified email+googleId from the frontend SDK.
router.post('/google', (req, res) => {
  const { role, googleId, email, firstName, lastName, company, school, age } = req.body || {};
  if (!['business', 'tester'].includes(role)) return res.status(400).json({ error: 'Invalid role' });
  if (!email || !googleId) return res.status(400).json({ error: 'Missing Google credentials' });

  let user = db.prepare('SELECT * FROM users WHERE email = ? OR google_id = ?').get(email, googleId);

  if (!user) {
    // Auto-create account on first Google sign-in
    const info = db.prepare(`
      INSERT INTO users (role, email, auth_method, google_id, first_name, last_name, company, school, age)
      VALUES (?, ?, 'google', ?, ?, ?, ?, ?, ?)
    `).run(role, email, googleId, firstName || 'New', lastName || 'User', company || null, school || null, age || null);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
  } else if (!user.google_id) {
    // Link existing email account to Google
    db.prepare('UPDATE users SET google_id = ?, auth_method = ? WHERE id = ?').run(googleId, 'google', user.id);
    user = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const token = signToken(user);
  res.json({ token, user: sanitizeUser(user) });
});

// ── Me ─────────────────────────────────────────────────
router.get('/me', authRequired, (req, res) => {
  res.json({ user: sanitizeUser(req.user) });
});

module.exports = router;
