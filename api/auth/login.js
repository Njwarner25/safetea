const bcrypt = require('bcryptjs');
const { getOne } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
          const body = await parseBody(req);
          const { email, password } = body;

      if (!email || !password) {
              return res.status(400).json({ error: 'Email and password are required' });
      }

      const user = await getOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
          if (!user) {
                  return res.status(401).json({ error: 'Invalid email or password' });
          }

      const validPassword = await bcrypt.compare(password, user.password_hash);
          if (!validPassword) {
                  return res.status(401).json({ error: 'Invalid email or password' });
          }

      const token = generateToken(user);
          return res.status(200).json({
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
          console.error('Login error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
