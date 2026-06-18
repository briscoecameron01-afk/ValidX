require('./lib/env');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');

const db = require('./lib/db');
const { hashPassword } = require('./lib/auth');
const { getPublicSupabaseConfig } = require('./lib/supabaseAuth');

const authRoutes = require('./routes/auth');
const experimentRoutes = require('./routes/experiments');
const payoutRoutes = require('./routes/payouts');
const adminRoutes = require('./routes/admin');

const app = express();

// ── Security ──────────────────────────────────
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.json({ limit: '2mb' }));

const allowed = (process.env.CORS_ORIGINS || 'http://localhost:8080')
  .split(',').map(s => s.trim());
app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowed.includes(origin) || allowed.includes('*')) return cb(null, true);
    cb(new Error('Not allowed by CORS'));
  },
  credentials: true,
}));

// Rate limit auth endpoints
app.use('/api/auth', rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { error: 'Too many requests, try again later' },
}));

// ── Routes ────────────────────────────────────
app.get('/api/health', (req, res) => res.json({ ok: true, ts: Date.now() }));
app.get('/api/config', (req, res) => {
  res.json({ supabase: getPublicSupabaseConfig() });
});
app.use('/api/auth', authRoutes);
app.use('/api/experiments', experimentRoutes);
app.use('/api/payouts', payoutRoutes);
app.use('/api/admin', adminRoutes);

// ── Static admin panel ────────────────────────
app.use(express.static(path.join(__dirname, 'public')));
app.get('/', (req, res) => res.redirect('/admin.html'));

// ── 404 + Error handler ───────────────────────
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Server error' });
});

// ── Bootstrap: create admin on first run ──────
function ensureAdmin() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@validx.com';
  const adminPassword = process.env.ADMIN_PASSWORD || 'changeme-please';
  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(adminEmail);
  if (!existing) {
    db.prepare(`
      INSERT INTO users (role, email, password_hash, auth_method, first_name, last_name)
      VALUES ('admin', ?, ?, 'email', 'ValidX', 'Admin')
    `).run(adminEmail, hashPassword(adminPassword));
    console.log(`✔ Admin account created: ${adminEmail}`);
  }
}
ensureAdmin();

// ── Start ─────────────────────────────────────
const PORT = Number(process.env.PORT) || 4000;
app.listen(PORT, () => {
  console.log(`✔ ValidX API listening on http://localhost:${PORT}`);
  console.log(`✔ Admin login at /admin.html with ${process.env.ADMIN_EMAIL || 'admin@validx.com'}`);
});
