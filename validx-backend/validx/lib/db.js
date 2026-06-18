const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');

const DB_PATH = process.env.DB_PATH || path.join(__dirname, '..', 'validx.db');
const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ── Schema ────────────────────────────────────────────
db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  role         TEXT NOT NULL CHECK(role IN ('business','tester','admin')),
  email        TEXT NOT NULL UNIQUE,
  password_hash TEXT,
  auth_method  TEXT NOT NULL DEFAULT 'email',
  google_id    TEXT,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL,
  -- business fields
  company      TEXT,
  industry     TEXT,
  company_size TEXT,
  -- tester fields
  school       TEXT,
  major        TEXT,
  age          INTEGER,
  status       TEXT NOT NULL DEFAULT 'active' CHECK(status IN ('active','suspended','banned')),
  created_at   INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS experiments (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id      INTEGER NOT NULL,
  title         TEXT NOT NULL,
  assumption    TEXT NOT NULL,
  type          TEXT NOT NULL,
  tier          TEXT NOT NULL CHECK(tier IN ('quick-test','deep-dive','full-study')),
  budget        INTEGER NOT NULL,
  reach         INTEGER NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','active','completed','archived')),
  paid_with     TEXT,
  payment_ref   TEXT,
  created_at    INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_experiments_owner ON experiments(owner_id);
CREATE INDEX IF NOT EXISTS idx_experiments_status ON experiments(status);

CREATE TABLE IF NOT EXISTS submissions (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  experiment_id  INTEGER NOT NULL,
  tester_id      INTEGER NOT NULL,
  notes          TEXT,
  files_json     TEXT,
  payout         INTEGER NOT NULL DEFAULT 0,
  status         TEXT NOT NULL DEFAULT 'submitted' CHECK(status IN ('submitted','approved','rejected')),
  admin_note     TEXT,
  created_at     INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  FOREIGN KEY(experiment_id) REFERENCES experiments(id) ON DELETE CASCADE,
  FOREIGN KEY(tester_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_submissions_experiment ON submissions(experiment_id);
CREATE INDEX IF NOT EXISTS idx_submissions_tester ON submissions(tester_id);

CREATE TABLE IF NOT EXISTS payouts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  tester_id   INTEGER NOT NULL,
  amount      INTEGER NOT NULL,
  method      TEXT NOT NULL CHECK(method IN ('stripe','paypal')),
  status      TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','processing','paid','failed')),
  reference   TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now')),
  paid_at     INTEGER,
  FOREIGN KEY(tester_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_payouts_tester ON payouts(tester_id);
CREATE INDEX IF NOT EXISTS idx_payouts_status ON payouts(status);

CREATE TABLE IF NOT EXISTS audit_log (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER,
  action      TEXT NOT NULL,
  details     TEXT,
  ip          TEXT,
  created_at  INTEGER NOT NULL DEFAULT (strftime('%s','now'))
);
`);

module.exports = db;
