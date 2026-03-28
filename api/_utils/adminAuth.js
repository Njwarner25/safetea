const { authenticate, cors, parseBody } = require('./auth');
const { run } = require('./db');

const ADMIN_ROLES = ['admin'];
const MOD_ROLES = ['admin', 'moderator'];

/**
 * Require admin role. Returns user or sends 401/403.
 */
async function requireAdmin(req, res) {
  cors(res);
  const user = await authenticate(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!ADMIN_ROLES.includes(user.role)) {
    res.status(403).json({ error: 'Admin access required' });
    return null;
  }
  return user;
}

/**
 * Require moderator or admin role. Returns user or sends 401/403.
 */
async function requireMod(req, res) {
  cors(res);
  const user = await authenticate(req);
  if (!user) {
    res.status(401).json({ error: 'Unauthorized' });
    return null;
  }
  if (!MOD_ROLES.includes(user.role)) {
    res.status(403).json({ error: 'Moderator access required' });
    return null;
  }
  return user;
}

/**
 * Log an admin/moderator action to audit_logs.
 */
async function logAudit(actorId, actorRole, action, targetType, targetId, details = {}, ipAddress = null) {
  try {
    await run(
      `INSERT INTO audit_logs (actor_id, actor_role, action, target_type, target_id, details, ip_address)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [actorId, actorRole, action, targetType, targetId, JSON.stringify(details), ipAddress]
    );
  } catch (err) {
    console.error('Audit log error:', err);
  }
}

module.exports = { requireAdmin, requireMod, logAudit, ADMIN_ROLES, MOD_ROLES };
