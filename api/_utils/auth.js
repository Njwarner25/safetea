const jwt = require('jsonwebtoken');
const { getOne } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'safetea-dev-secret-change-me';

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
        'SELECT id, email, display_name, role, city, bio, created_at FROM users WHERE id = $1',
        [decoded.id]
      );
    return user;
}

function cors(res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

function parseBody(req) {
    return new Promise((resolve, reject) => {
          if (req.body) return resolve(req.body);
          let data = '';
          req.on('data', chunk => { data += chunk; });
          req.on('end', () => {
                  try {
                            resolve(data ? JSON.parse(data) : {});
                  } catch (e) {
                            reject(new Error('Invalid JSON'));
                  }
          });
    });
}

module.exports = { generateToken, verifyToken, authenticate, cors, parseBody, JWT_SECRET };
