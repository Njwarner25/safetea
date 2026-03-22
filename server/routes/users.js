const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');
const { requirePaid } = require('../middleware/requirePaid');

const router = express.Router();

// Curated word lists for random name generation
const ADJECTIVES = [
  'Midnight', 'Golden', 'Silver', 'Velvet', 'Crystal', 'Cosmic', 'Misty', 'Autumn',
  'Coral', 'Ember', 'Sage', 'Azure', 'Crimson', 'Indigo', 'Ivory', 'Jade',
  'Luna', 'Maple', 'Ocean', 'Pearl', 'Rose', 'Sky', 'Storm', 'Sunset',
  'Whisper', 'Willow', 'Winter', 'Zen', 'Amber', 'Blaze', 'Cedar', 'Dawn'
];

const NOUNS = [
  'Jasmine', 'Phoenix', 'Sparrow', 'Meadow', 'River', 'Orchid', 'Petal', 'Haven',
  'Breeze', 'Harbor', 'Blossom', 'Fern', 'Frost', 'Honey', 'Ivy', 'Lark',
  'Lotus', 'Moss', 'Rain', 'Sage', 'Star', 'Tide', 'Vale', 'Wren',
  'Bloom', 'Brook', 'Clover', 'Dusk', 'Echo', 'Flame', 'Grace', 'Haze'
];

const AVATAR_COLORS = [
  '#e74c3c', '#e67e22', '#f1c40f', '#2ecc71', '#3498db', '#9b59b6', '#6c7b95',
  '#1abc9c', '#d35400', '#8e44ad', '#2980b9', '#27ae60', '#c0392b', '#7f8c8d'
];

// GET /api/users/profile - Get own profile
router.get('/profile', authenticate, (req, res) => {
  const user = db.prepare(`
    SELECT id, email, display_name, role, city, state, is_verified, is_anonymous,
      avatar_initial, avatar_color, avatar_type, avatar_url, custom_display_name,
      subscription_tier, created_at, last_login
    FROM users WHERE id = ?
  `).get(req.user.id);

  const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(req.user.id);
  const replyCount = db.prepare('SELECT COUNT(*) as count FROM replies WHERE user_id = ?').get(req.user.id);

  res.json({
    user,
    stats: {
      posts: postCount.count,
      replies: replyCount.count
    }
  });
});

// PUT /api/users/profile - Update profile (including avatar customization)
router.put('/profile', authenticate, (req, res) => {
  const { display_name, city, state, is_anonymous, avatar_type, avatar_url, custom_display_name, avatar_color, avatar_initial } = req.body;

  // Validate avatar_type if provided
  const validTypes = ['initial', 'custom', 'generated', 'upload'];
  if (avatar_type && !validTypes.includes(avatar_type)) {
    return res.status(400).json({ error: 'Invalid avatar type. Must be: initial, custom, generated, or upload' });
  }

  // Upload type requires premium
  if (avatar_type === 'upload') {
    const userTier = db.prepare('SELECT subscription_tier FROM users WHERE id = ?').get(req.user.id);
    if (!userTier || userTier.subscription_tier !== 'premium') {
      return res.status(403).json({
        error: 'Premium subscription required for avatar upload',
        upgrade: true
      });
    }
  }

  try {
    if (avatar_type === 'initial') {
      // When switching to 'initial', explicitly clear custom fields
      db.prepare(`
        UPDATE users SET
          display_name = COALESCE(?, display_name),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          is_anonymous = COALESCE(?, is_anonymous),
          avatar_type = 'initial',
          avatar_url = NULL,
          custom_display_name = NULL,
          avatar_color = COALESCE(?, avatar_color),
          avatar_initial = COALESCE(?, avatar_initial),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        display_name || null,
        city || null,
        state || null,
        is_anonymous !== undefined ? (is_anonymous ? 1 : 0) : null,
        avatar_color || null,
        avatar_initial || null,
        req.user.id
      );
    } else {
      db.prepare(`
        UPDATE users SET
          display_name = COALESCE(?, display_name),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          is_anonymous = COALESCE(?, is_anonymous),
          avatar_type = COALESCE(?, avatar_type),
          avatar_url = COALESCE(?, avatar_url),
          custom_display_name = COALESCE(?, custom_display_name),
          avatar_color = COALESCE(?, avatar_color),
          avatar_initial = COALESCE(?, avatar_initial),
          updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(
        display_name || null,
        city || null,
        state || null,
        is_anonymous !== undefined ? (is_anonymous ? 1 : 0) : null,
        avatar_type || null,
        avatar_url || null,
        custom_display_name || null,
        avatar_color || null,
        avatar_initial || null,
        req.user.id
      );
    }

    const updated = db.prepare(`
      SELECT id, email, display_name, role, city, state, is_verified, is_anonymous,
        avatar_initial, avatar_color, avatar_type, avatar_url, custom_display_name, subscription_tier
      FROM users WHERE id = ?
    `).get(req.user.id);

    res.json({ user: updated });
  } catch (err) {
    console.error('Update profile error:', err);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// GET /api/users/generate-avatar - Generate a random pseudonym + color combo
router.get('/generate-avatar', authenticate, (req, res) => {
  const adjective = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)];
  const noun = NOUNS[Math.floor(Math.random() * NOUNS.length)];
  const color = AVATAR_COLORS[Math.floor(Math.random() * AVATAR_COLORS.length)];
  const displayName = adjective + ' ' + noun;
  const initial = adjective[0].toUpperCase();

  res.json({
    display_name: displayName,
    color: color,
    initial: initial
  });
});

// GET /api/users/admin/list - Admin: list all users
router.get('/admin/list', authenticate, requireRole('admin', 'moderator'), (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  const users = db.prepare(`
    SELECT id, email, display_name, role, city, state, is_verified, subscription_tier, created_at, last_login
    FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
  `).all(parseInt(limit), parseInt(offset));

  const { total } = db.prepare('SELECT COUNT(*) as total FROM users').get();

  res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = router;
