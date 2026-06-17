const express = require('express');
const db = require('../lib/db');
const { authRequired, requireRole } = require('../middleware/authRequired');

const router = express.Router();

// Get my earnings summary (tester)
router.get('/earnings', authRequired, requireRole('tester'), (req, res) => {
  const earned = db.prepare(`
    SELECT COALESCE(SUM(payout), 0) AS total
    FROM submissions WHERE tester_id = ? AND status = 'approved'
  `).get(req.user.id).total;

  const paidOut = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payouts WHERE tester_id = ? AND status = 'paid'
  `).get(req.user.id).total;

  const pending = db.prepare(`
    SELECT COALESCE(SUM(amount), 0) AS total
    FROM payouts WHERE tester_id = ? AND status IN ('pending','processing')
  `).get(req.user.id).total;

  const available = Math.max(0, earned - paidOut - pending);

  const history = db.prepare(`
    SELECT id, amount, method, status, created_at, paid_at
    FROM payouts WHERE tester_id = ? ORDER BY created_at DESC LIMIT 50
  `).all(req.user.id);

  res.json({ earned, paidOut, pending, available, history });
});

// Request a cashout
router.post('/cashout', authRequired, requireRole('tester'), (req, res) => {
  const { amount, method } = req.body || {};
  const amt = Math.floor(Number(amount));
  if (!amt || amt < 5) return res.status(400).json({ error: 'Minimum cashout is $5' });
  if (!['stripe', 'paypal'].includes(method)) return res.status(400).json({ error: 'Invalid method' });

  // Check available balance
  const earned = db.prepare("SELECT COALESCE(SUM(payout), 0) AS t FROM submissions WHERE tester_id = ? AND status = 'approved'").get(req.user.id).t;
  const claimed = db.prepare("SELECT COALESCE(SUM(amount), 0) AS t FROM payouts WHERE tester_id = ? AND status IN ('pending','processing','paid')").get(req.user.id).t;
  const available = earned - claimed;
  if (amt > available) return res.status(400).json({ error: `Only $${available} available` });

  const info = db.prepare(`
    INSERT INTO payouts (tester_id, amount, method, status) VALUES (?, ?, ?, 'pending')
  `).run(req.user.id, amt, method);

  res.status(201).json({ payout: db.prepare('SELECT * FROM payouts WHERE id = ?').get(info.lastInsertRowid) });
});

module.exports = router;
