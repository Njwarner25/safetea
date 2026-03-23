const express = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getOne, query } = require('../db/database');
const { authenticate, generateToken } = require('../middleware/auth');

const router = express.Router();

// POST /api/auth/register
router.post('/register', [
  body('email').isEmail().normalizeEmail(),
  body('password').isLength({ min: 8 }).withMessage('Password must be at least 8 characters'),
  body('display_name').trim().isLength({ min: 2, max: 50 }),
  body('city').trim().notEmpty(),
  body('state').trim().isLength({ min: 2, max: 2 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password, display_name, city, state } = req.body;

  try {
    // Check if user exists
    const existing = await getOne('SELECT id FROM users WHERE email = $1', [email]);
    if (existing) {
      return res.status(409).json({ error: 'Email already registered' });
    }

    const id = uuidv4();
    const password_hash = await bcrypt.hash(password, 10);
    const avatar_initial = display_name.charAt(0).toUpperCase();
    const colors = ['#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#6c7b95'];
    const avatar_color = colors[Math.floor(Math.random() * colors.length)];

    await query(`
      INSERT INTO users (id, email, password_hash, display_name, city, state, avatar_initial, avatar_color)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `, [id, email, password_hash, display_name, city, state, avatar_initial, avatar_color]);

    const token = generateToken(id);

    res.status(201).json({
      message: 'Registration successful',
      token,
      user: {
        id, email, display_name, role: 'member', city, state,
        is_verified: false, is_anonymous: true, avatar_initial, avatar_color,
        avatar_type: 'initial', avatar_url: null, custom_display_name: null,
        subscription_tier: 'free'
      }
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Registration failed' });
  }
});

// POST /api/auth/login
router.post('/login', [
  body('email').isEmail().normalizeEmail(),
  body('password').notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { email, password } = req.body;

  try {
    const user = await getOne('SELECT * FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Update last login
    await query('UPDATE users SET last_login = NOW() WHERE id = $1', [user.id]);

    const token = generateToken(user.id);

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        email: user.email,
        display_name: user.display_name,
        role: user.role,
        city: user.city,
        state: user.state,
        is_verified: user.is_verified,
        is_anonymous: user.is_anonymous,
        avatar_initial: user.avatar_initial,
        avatar_color: user.avatar_color,
        avatar_type: user.avatar_type || 'initial',
        avatar_url: user.avatar_url || null,
        custom_display_name: user.custom_display_name || null,
        subscription_tier: user.subscription_tier || 'free'
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Login failed' });
  }
});

// GET /api/auth/me - Get current user
router.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

// POST /api/auth/logout
router.post('/logout', authenticate, (req, res) => {
  res.json({ message: 'Logged out successfully' });
});

module.exports = router;
