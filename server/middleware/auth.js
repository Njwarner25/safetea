const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'safetea-dev-secret-change-in-production';

// Verify JWT token middleware
function authenticate(req, res, next) {
    const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Access token required' });
  }

  const token = authHeader.split(' ')[1];

  try {
        const decoded = jwt.verify(token, JWT_SECRET);

      // Check if user still exists
      const user = db.prepare('SELECT id, email, display_name, role, city, state, is_verified, avatar_initial, avatar_color FROM users WHERE id = ?').get(decoded.userId);

      if (!user) {
              return res.status(401).json({ error: 'User not found' });
      }

      req.user = user;
        next();
  } catch (err) {
        if (err.name === 'TokenExpiredError') {
                return res.status(401).json({ error: 'Token expired' });
        }
        return res.status(401).json({ error: 'Invalid token' });
  }
}

// Optional auth - doesn't fail if no token
function optionalAuth(req, res, next) {
    const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.split(' ')[1];
        try {
                const decoded = jwt.verify(token, JWT_SECRET);
                const user = db.prepare('SELECT id, email, display_name, role, city, state, is_verified, avatar_initial, avatar_color FROM users WHERE id = ?').get(decoded.userId);
                if (user) req.user = user;
        } catch (err) {
                // Silently ignore invalid tokens for optional auth
        }
  }
    next();
}

// Require specific role
function requireRole(...roles) {
    return (req, res, next) => {
          if (!req.user) {
                  return res.status(401).json({ error: 'Authentication required' });
          }
          if (!roles.includes(req.user.role)) {
                  return res.status(403).json({ error: 'Insufficient permissions' });
          }
          next();
    };
}

// Generate JWT token
function generateToken(userId) {
    return jwt.sign({ userId }, JWT_SECRET, { expiresIn: '7d' });
}

module.exports = { authenticate, optionalAuth, requireRole, generateToken, JWT_SECRET };
