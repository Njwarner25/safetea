const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

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
router.get('/profile', authenticate, async (req, res) => {
  try {
    const user = await getOne(`
      SELECT id, email, display_name, role, city, state, is_verified, is_anonymous,
        avatar_initial, avatar_color, avatar_type, avatar_url, custom_display_name,
        subscription_tier, created_at, last_login
      FROM users WHERE id = $1
    `, [req.user.id]);

    const postCount = await getOne('SELECT COUNT(*) as count FROM posts WHERE user_id = $1', [req.user.id]);
    const replyCount = await getOne('SELECT COUNT(*) as count FROM replies WHERE user_id = $1', [req.user.id]);

    res.json({
      user,
      stats: {
        posts: parseInt(postCount.count),
        replies: parseInt(replyCount.count)
      }
    });
  } catch (err) {
    console.error('Get profile error:', err);
    res.status(500).json({ error: 'Failed to load profile' });
  }
});

// PUT /api/users/profile - Update profile (including avatar customization)
router.put('/profile', authenticate, async (req, res) => {
  const { display_name, city, state, is_anonymous, avatar_type, avatar_url, custom_display_name, avatar_color, avatar_initial } = req.body;

  // Validate avatar_type if provided
  const validTypes = ['initial', 'custom', 'generated', 'upload'];
  if (avatar_type && !validTypes.includes(avatar_type)) {
    return res.status(400).json({ error: 'Invalid avatar type. Must be: initial, custom, generated, or upload' });
  }

  try {
    // Upload type requires premium
    if (avatar_type === 'upload') {
      const userTier = await getOne('SELECT subscription_tier FROM users WHERE id = $1', [req.user.id]);
      if (!userTier || userTier.subscription_tier !== 'premium') {
        return res.status(403).json({
          error: 'Premium subscription required for avatar upload',
          upgrade: true
        });
      }
    }

    if (avatar_type === 'initial') {
      await query(`
        UPDATE users SET
          display_name = COALESCE($1, display_name),
          city = COALESCE($2, city),
          state = COALESCE($3, state),
          is_anonymous = COALESCE($4, is_anonymous),
          avatar_type = 'initial',
          avatar_url = NULL,
          custom_display_name = NULL,
          avatar_color = COALESCE($5, avatar_color),
          avatar_initial = COALESCE($6, avatar_initial),
          updated_at = NOW()
        WHERE id = $7
      `, [
        display_name || null,
        city || null,
        state || null,
        is_anonymous !== undefined ? is_anonymous : null,
        avatar_color || null,
        avatar_initial || null,
        req.user.id
      ]);
    } else {
      await query(`
        UPDATE users SET
          display_name = COALESCE($1, display_name),
          city = COALESCE($2, city),
          state = COALESCE($3, state),
          is_anonymous = COALESCE($4, is_anonymous),
          avatar_type = COALESCE($5, avatar_type),
          avatar_url = COALESCE($6, avatar_url),
          custom_display_name = COALESCE($7, custom_display_name),
          avatar_color = COALESCE($8, avatar_color),
          avatar_initial = COALESCE($9, avatar_initial),
          updated_at = NOW()
        WHERE id = $10
      `, [
        display_name || null,
        city || null,
        state || null,
        is_anonymous !== undefined ? is_anonymous : null,
        avatar_type || null,
        avatar_url || null,
        custom_display_name || null,
        avatar_color || null,
        avatar_initial || null,
        req.user.id
      ]);
    }

    const updated = await getOne(`
      SELECT id, email, display_name, role, city, state, is_verified, is_anonymous,
        avatar_initial, avatar_color, avatar_type, avatar_url, custom_display_name, subscription_tier
      FROM users WHERE id = $1
    `, [req.user.id]);

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
router.get('/admin/list', authenticate, requireRole('admin', 'moderator'), async (req, res) => {
  const { page = 1, limit = 50 } = req.query;
  const offset = (page - 1) * limit;

  try {
    const users = await getAll(`
      SELECT id, email, display_name, role, city, state, is_verified, subscription_tier, created_at, last_login
      FROM users ORDER BY created_at DESC LIMIT $1 OFFSET $2
    `, [parseInt(limit), parseInt(offset)]);

    const result = await getOne('SELECT COUNT(*) as total FROM users');

    res.json({ users, total: parseInt(result.total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('List users error:', err);
    res.status(500).json({ error: 'Failed to list users' });
  }
});

module.exports = router;
