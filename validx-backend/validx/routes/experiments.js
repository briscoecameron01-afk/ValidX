const express = require('express');
const db = require('../lib/db');
const { authRequired, requireRole } = require('../middleware/authRequired');

const router = express.Router();

const TIERS = {
  'quick-test': { price: 29, reach: 10 },
  'deep-dive':  { price: 89, reach: 25 },
  'full-study': { price: 250, reach: 50 },
};

// List experiments — businesses see their own, testers see all active
router.get('/', authRequired, (req, res) => {
  const rows = req.user.role === 'business'
    ? db.prepare('SELECT * FROM experiments WHERE owner_id = ? ORDER BY created_at DESC').all(req.user.id)
    : db.prepare("SELECT * FROM experiments WHERE status = 'active' ORDER BY created_at DESC").all();
  res.json({ experiments: rows });
});

// Get single experiment with submissions
router.get('/:id', authRequired, (req, res) => {
  const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (req.user.role === 'business' && exp.owner_id !== req.user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }
  const submissions = db.prepare(`
    SELECT s.*, u.first_name, u.last_name FROM submissions s
    JOIN users u ON u.id = s.tester_id
    WHERE s.experiment_id = ? ORDER BY s.created_at DESC
  `).all(req.params.id);
  res.json({ experiment: exp, submissions });
});

// Create experiment (business only)
router.post('/', authRequired, requireRole('business'), (req, res) => {
  const { title, assumption, type, tier, paidWith, paymentRef } = req.body || {};
  if (!title || !assumption || !type || !tier) return res.status(400).json({ error: 'Missing fields' });
  if (!TIERS[tier]) return res.status(400).json({ error: 'Invalid tier' });

  const { price, reach } = TIERS[tier];
  const info = db.prepare(`
    INSERT INTO experiments (owner_id, title, assumption, type, tier, budget, reach, status, paid_with, payment_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, 'active', ?, ?)
  `).run(req.user.id, title, assumption, type, tier, price, reach, paidWith || null, paymentRef || null);

  const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ experiment: exp });
});

// Update experiment status (owner only)
router.patch('/:id', authRequired, requireRole('business'), (req, res) => {
  const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (exp.owner_id !== req.user.id) return res.status(403).json({ error: 'Forbidden' });

  const { status } = req.body || {};
  if (status && !['active', 'completed', 'archived'].includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }
  if (status) {
    db.prepare('UPDATE experiments SET status = ? WHERE id = ?').run(status, exp.id);
  }
  const updated = db.prepare('SELECT * FROM experiments WHERE id = ?').get(exp.id);
  res.json({ experiment: updated });
});

// Submit data to an experiment (tester only)
router.post('/:id/submissions', authRequired, requireRole('tester'), (req, res) => {
  const exp = db.prepare('SELECT * FROM experiments WHERE id = ?').get(req.params.id);
  if (!exp) return res.status(404).json({ error: 'Not found' });
  if (exp.status !== 'active') return res.status(400).json({ error: 'Experiment not accepting submissions' });

  const { notes, files } = req.body || {};
  if (!notes || notes.trim().length < 10) return res.status(400).json({ error: 'Please include notes (10+ chars)' });

  // Payout = 30% of tier price
  const payout = Math.round(exp.budget * 0.3);
  const info = db.prepare(`
    INSERT INTO submissions (experiment_id, tester_id, notes, files_json, payout, status)
    VALUES (?, ?, ?, ?, ?, 'submitted')
  `).run(exp.id, req.user.id, notes.trim(), JSON.stringify(files || []), payout);

  res.status(201).json({
    submission: db.prepare('SELECT * FROM submissions WHERE id = ?').get(info.lastInsertRowid),
    payout,
  });
});

module.exports = router;
