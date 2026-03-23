const { getOne } = require('../db/database');

// Middleware to gate features behind the $5.99 premium tier
async function requirePaid(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const user = await getOne('SELECT subscription_tier, role FROM users WHERE id = $1', [req.user.id]);

  if (!user || (user.subscription_tier !== 'premium' && !['admin', 'moderator'].includes(user.role))) {
    return res.status(403).json({
      error: 'Premium subscription required',
      upgrade: true,
      message: 'This feature requires a Premium subscription ($5.99/mo). Upgrade to unlock messaging, photo uploads, and more.'
    });
  }

  next();
}

module.exports = { requirePaid };
