const { verifyToken } = require('../lib/auth');
const db = require('../lib/db');
const { verifySupabaseAccessToken, upsertLocalUserFromSupabase } = require('../lib/supabaseAuth');

async function authRequired(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Missing token' });

  const payload = verifyToken(token);
  if (payload) {
    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(payload.id);
    if (!user) return res.status(401).json({ error: 'User not found' });
    if (user.status !== 'active') return res.status(403).json({ error: `Account ${user.status}` });
    req.user = user;
    req.authProvider = 'jwt';
    return next();
  }

  try {
    const supabaseUser = await verifySupabaseAccessToken(token);
    if (!supabaseUser) return res.status(401).json({ error: 'Invalid or expired token' });

    const user = upsertLocalUserFromSupabase(supabaseUser);
    if (user.status !== 'active') return res.status(403).json({ error: `Account ${user.status}` });
    req.user = user;
    req.supabaseUser = supabaseUser;
    req.authProvider = 'supabase';
    return next();
  } catch (err) {
    console.error('Supabase auth failed:', err);
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });
    if (!roles.includes(req.user.role)) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { authRequired, requireRole };
