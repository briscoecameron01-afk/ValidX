const express = require('express');
const db = require('../lib/db');
const { authRequired, requireRole } = require('../middleware/authRequired');

const router = express.Router();
router.use(authRequired, requireRole('admin'));

// ── Dashboard stats ───────────────────────────────────
router.get('/stats', (req, res) => {
  const users = db.prepare('SELECT COUNT(*) AS t FROM users WHERE role != "admin"').get().t;
  const businesses = db.prepare("SELECT COUNT(*) AS t FROM users WHERE role = 'business'").get().t;
  const testers = db.prepare("SELECT COUNT(*) AS t FROM users WHERE role = 'tester'").get().t;
  const experiments = db.prepare('SELECT COUNT(*) AS t FROM experiments').get().t;
  const activeExperiments = db.prepare("SELECT COUNT(*) AS t FROM experiments WHERE status = 'active'").get().t;
  const submissions = db.prepare('SELECT COUNT(*) AS t FROM submissions').get().t;
  const pendingSubmissions = db.prepare("SELECT COUNT(*) AS t FROM submissions WHERE status = 'submitted'").get().t;
  const grossRevenue = db.prepare("SELECT COALESCE(SUM(budget),0) AS t FROM experiments WHERE status != 'draft'").get().t;
  const paidOut = db.prepare("SELECT COALESCE(SUM(amount),0) AS t FROM payouts WHERE status = 'paid'").get().t;
  const pendingPayouts = db.prepare("SELECT COUNT(*) AS t FROM payouts WHERE status = 'pending'").get().t;

  res.json({
    users, businesses, testers,
    experiments, activeExperiments,
    submissions, pendingSubmissions,
    grossRevenue, paidOut, pendingPayouts,
    platformMargin: Math.round(grossRevenue * 0.7),
  });
});

// ── Users ─────────────────────────────────────────────
router.get('/users', (req, res) => {
  const { role, q } = req.query;
  let sql = 'SELECT id, role, email, first_name, last_name, company, school, status, created_at, auth_method FROM users WHERE role != "admin"';
  const params = [];
  if (role && ['business', 'tester'].includes(role)) {
    sql += ' AND role = ?';
    params.push(role);
  }
  if (q) {
    sql += ' AND (email LIKE ? OR first_name LIKE ? OR last_name LIKE ? OR company LIKE ?)';
    const like = `%${q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY created_at DESC LIMIT 500';
  res.json({ users: db.prepare(sql).all(...params) });
});

router.patch('/users/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'suspended', 'banned'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE users SET status = ? WHERE id = ? AND role != "admin"').run(status, req.params.id);
  res.json({ ok: true });
});

// ── Experiments ───────────────────────────────────────
router.get('/experiments', (req, res) => {
  const rows = db.prepare(`
    SELECT e.*, u.first_name || ' ' || u.last_name AS owner_name, u.company AS owner_company
    FROM experiments e JOIN users u ON u.id = e.owner_id
    ORDER BY e.created_at DESC LIMIT 500
  `).all();
  res.json({ experiments: rows });
});

router.patch('/experiments/:id', (req, res) => {
  const { status } = req.body || {};
  if (!['active', 'completed', 'archived'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

// ── Submissions ───────────────────────────────────────
router.get('/submissions', (req, res) => {
  const { status } = req.query;
  let sql = `
    SELECT s.*, e.title AS experiment_title, u.first_name || ' ' || u.last_name AS tester_name
    FROM submissions s
    JOIN experiments e ON e.id = s.experiment_id
    JOIN users u ON u.id = s.tester_id
  `;
  const params = [];
  if (status && ['submitted', 'approved', 'rejected'].includes(status)) {
    sql += ' WHERE s.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY s.created_at DESC LIMIT 500';
  res.json({ submissions: db.prepare(sql).all(...params) });
});

router.patch('/submissions/:id', (req, res) => {
  const { status, admin_note } = req.body || {};
  if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  db.prepare('UPDATE submissions SET status = ?, admin_note = ? WHERE id = ?').run(status, admin_note || null, req.params.id);
  res.json({ ok: true });
});

// ── Payouts ───────────────────────────────────────────
router.get('/payouts', (req, res) => {
  const rows = db.prepare(`
    SELECT p.*, u.first_name || ' ' || u.last_name AS tester_name, u.email
    FROM payouts p JOIN users u ON u.id = p.tester_id
    ORDER BY p.created_at DESC LIMIT 500
  `).all();
  res.json({ payouts: rows });
});

router.patch('/payouts/:id', (req, res) => {
  const { status, reference } = req.body || {};
  if (!['pending', 'processing', 'paid', 'failed'].includes(status)) return res.status(400).json({ error: 'Invalid status' });
  const paidAt = status === 'paid' ? Math.floor(Date.now() / 1000) : null;
  db.prepare('UPDATE payouts SET status = ?, reference = ?, paid_at = ? WHERE id = ?').run(status, reference || null, paidAt, req.params.id);
  res.json({ ok: true });
});

module.exports = router;
