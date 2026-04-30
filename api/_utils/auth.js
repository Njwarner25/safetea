const jwt = require('jsonwebtoken');
const { getOne } = require('./db');

// SECURITY: JWT_SECRET must be set in environment — no fallback
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.error('CRITICAL: JWT_SECRET environment variable is not set. Auth will fail.');
}

function generateToken(user) {
    return jwt.sign(
      { id: user.id, email: user.email, role: user.role },
          JWT_SECRET,
      { expiresIn: '7d' }
        );
}

function verifyToken(token) {
    try {
          return jwt.verify(token, JWT_SECRET);
    } catch (err) {
          return null;
    }
}

async function authenticate(req) {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
          return null;
    }
    const token = authHeader.split(' ')[1];
    const decoded = verifyToken(token);
    if (!decoded) return null;

  const user = await getOne(
        'SELECT id, email, display_name, role, city, bio, subscription_tier, avatar_type, avatar_color, avatar_initial, avatar_url, custom_display_name, created_at, trust_score, identity_verified, age_verified, gender_verified, phone_verified, didit_verified, verification_deadline, banned, ban_type, ban_until, warning_count, stripe_customer_id, stripe_subscription_id FROM users WHERE id = $1',
        [decoded.id]
      );
    return user;
}

function cors(res, req) {
    // SECURITY: Restrict CORS to trusted origins only
    const allowedOrigins = [
      'https://getsafetea.app',
      'https://www.getsafetea.app',
      'https://safetea-landing.vercel.app',
    ];
    // Allow localhost in development
    if (process.env.NODE_ENV !== 'production') {
      allowedOrigins.push('http://localhost:3000', 'http://localhost:5173', 'http://localhost:8080');
    }
    const origin = (req && req.headers && req.headers.origin) || '';
    if (origin && allowedOrigins.includes(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
    } else if (!origin) {
      // No origin header = same-origin request or non-browser (mobile app, curl, etc.)
      res.setHeader('Access-Control-Allow-Origin', '*');
    } else {
      // Unknown origin — set to main domain (browser will block cross-origin)
      res.setHeader('Access-Control-Allow-Origin', 'https://www.getsafetea.app');
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
          if (req.body) {
                  if (typeof req.body === 'string') {
                          try { return resolve(JSON.parse(req.body)); } catch(e) { return resolve({}); }
                  }
                  return resolve(req.body);
          }
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
                  try {
                            resolve(data ? JSON.parse(data) : {});
                  } catch (e) {
                            resolve({});
                  }
          });
          req.on('error', () => resolve({}));
    });
}

module.exports = { generateToken, verifyToken, authenticate, cors, parseBody, JWT_SECRET };
