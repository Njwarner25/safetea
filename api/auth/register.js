const bcrypt = require('bcryptjs');
const { getOne, run } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');
const { sendWelcomeEmail } = require('../../services/email');
const { checkRateLimit, getClientIP } = require('../../services/rateLimit');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
          // Rate limit: 5 registrations per hour per IP
          const limited = await checkRateLimit(getClientIP(req), 'register', 5, 3600);
          if (limited) {
              return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
          }

          const body = await parseBody(req);
          const { email, password, display_name, city } = body;

      if (!email || !password || !display_name) {
              return res.status(400).json({ error: 'Email, password, and display name are required' });
      }

      if (password.length < 8) {
              return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await getOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
          if (existing) {
                  return res.status(409).json({ error: 'An account with this email already exists' });
          }

      const password_hash = await bcrypt.hash(password, 10);
          const result = await run(
                  'INSERT INTO users (email, password_hash, display_name, city) VALUES ($1, $2, $3, $4) RETURNING id',
                  [email.toLowerCase(), password_hash, display_name, city || null]
                );

      const user = await getOne('SELECT id, email, display_name, role, city FROM users WHERE email = $1', [email.toLowerCase()]);
          const token = generateToken(user);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(user.email, user.display_name).catch(function(err) {
        console.error('[Register] Welcome email failed:', err.message);
      });

      return res.status(201).json({
              token,
              user: {
                        id: user.id,
                        email: user.email,
                        display_name: user.display_name,
                        role: user.role,
                        city: user.city
              }
      });
    } catch (error) {
          console.error('Register error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
