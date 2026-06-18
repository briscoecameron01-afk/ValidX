require('./env');
const db = require('./db');

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';
const SUPABASE_AUTH_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

function getPublicSupabaseConfig() {
  return {
    enabled: SUPABASE_AUTH_ENABLED,
    url: SUPABASE_URL,
    anonKey: SUPABASE_ANON_KEY,
  };
}

async function verifySupabaseAccessToken(token) {
  if (!SUPABASE_AUTH_ENABLED || !token) return null;

  const res = await fetch(`${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!res.ok) return null;
  return res.json();
}

function splitName(user) {
  const metadata = user.user_metadata || {};
  const explicitFirst = metadata.firstName || metadata.first_name;
  const explicitLast = metadata.lastName || metadata.last_name;
  if (explicitFirst || explicitLast) {
    return {
      firstName: explicitFirst || 'New',
      lastName: explicitLast || 'User',
    };
  }

  const fullName = metadata.full_name || metadata.name || user.email || 'New User';
  const [firstName, ...rest] = String(fullName).trim().split(/\s+/);
  return {
    firstName: firstName || 'New',
    lastName: rest.join(' ') || 'User',
  };
}

function requestedPublicRole(metadata = {}) {
  return ['business', 'tester'].includes(metadata.role) ? metadata.role : 'tester';
}

function upsertLocalUserFromSupabase(supabaseUser) {
  const metadata = supabaseUser.user_metadata || {};
  const email = supabaseUser.email;
  if (!email) throw new Error('Supabase user is missing an email');

  let user = db.prepare('SELECT * FROM users WHERE supabase_id = ?').get(supabaseUser.id);
  if (!user) {
    user = db.prepare('SELECT * FROM users WHERE lower(email) = lower(?)').get(email);
  }

  if (user) {
    db.prepare(`
      UPDATE users
      SET supabase_id = COALESCE(supabase_id, ?), auth_method = 'supabase'
      WHERE id = ?
    `).run(supabaseUser.id, user.id);
    return db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);
  }

  const { firstName, lastName } = splitName(supabaseUser);
  const role = requestedPublicRole(metadata);
  const info = db.prepare(`
    INSERT INTO users (
      role, email, auth_method, supabase_id, first_name, last_name,
      company, industry, company_size, school, major, age
    )
    VALUES (?, ?, 'supabase', ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    role,
    email,
    supabaseUser.id,
    firstName,
    lastName,
    metadata.company || null,
    metadata.industry || null,
    metadata.companySize || metadata.company_size || null,
    metadata.school || null,
    metadata.major || null,
    metadata.age ? Number(metadata.age) : null,
  );

  return db.prepare('SELECT * FROM users WHERE id = ?').get(info.lastInsertRowid);
}

module.exports = {
  getPublicSupabaseConfig,
  verifySupabaseAccessToken,
  upsertLocalUserFromSupabase,
};
