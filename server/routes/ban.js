const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { authenticate, requireRole } = require('../middleware/auth');
const { query, getOne } = require('../db/database');

const router = express.Router();

// POST /api/admin/ban - Ban a user (admin only)
router.post(
  '/',
  authenticate,
  requireRole('admin'),
  [
    body('user_id').isUUID().notEmpty(),
    body('reason').trim().isLength({ min: 10 }).withMessage('Reason must be at least 10 characters'),
    body('ban_type').isIn(['temporary', 'permanent']),
    body('duration_days').optional().isInt({ min: 1, max: 365 }).toInt()
  ],
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { user_id, reason, ban_type, duration_days } = req.body;
    const adminId = req.user.id;

    try {
      // Verify user exists
      const user = await getOne('SELECT id, role FROM users WHERE id = $1', [user_id]);
      if (!user) {
        return res.status(404).json({ error: 'User not found' });
      }

      // Guard: can't ban yourself
      if (user_id === adminId) {
        return res.status(400).json({ error: 'You cannot ban yourself' });
      }

      // Guard: can't ban other admins
      if (user.role === 'admin') {
        return res.status(403).json({ error: 'You cannot ban other administrators' });
      }

      // Guard: must provide reason
      if (!reason || reason.trim().length === 0) {
        return res.status(400).json({ error: 'Ban reason is required' });
      }

      // Calculate ban_until for temporary bans
      let banUntil = null;
      if (ban_type === 'temporary') {
        if (!duration_days || duration_days <= 0) {
          return res.status(400).json({ error: 'Duration in days is required for temporary bans' });
        }
        banUntil = new Date();
        banUntil.setDate(banUntil.getDate() + duration_days);
      }

      // Update user record
      await query(
        `UPDATE users
         SET banned = true,
             banned_at = NOW(),
             ban_reason = $1,
             ban_type = $2,
             ban_until = $3
         WHERE id = $4`,
        [reason, ban_type, banUntil, user_id]
      );

      // Hide all user's posts
      await query(
        `UPDATE posts
         SET hidden = true
         WHERE user_id = $1`,
        [user_id]
      );

      // Log to ban_log table
      const logId = uuidv4();
      await query(
        `INSERT INTO ban_log (id, user_id, banned_by, reason, ban_type, duration_days, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
        [logId, user_id, adminId, reason, ban_type, duration_days || null]
      );

      res.status(200).json({
        message: 'User banned successfully',
        ban: {
          user_id,
          ban_type,
          reason,
          banned_at: new Date().toISOString(),
          ban_until: banUntil ? banUntil.toISOString() : null,
          duration_days: duration_days || null
        }
      });
    } catch (err) {
      console.error('Ban user error:', err);
      res.status(500).json({ error: 'Failed to ban user' });
    }
  }
);

// GET /api/admin/ban/:user_id - Check if user is banned
router.get('/:user_id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await getOne(
      `SELECT id, banned, banned_at, ban_reason, ban_type, ban_until
       FROM users
       WHERE id = $1`,
      [user_id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      user_id,
      banned: user.banned || false,
      ban_reason: user.ban_reason || null,
      ban_type: user.ban_type || null,
      banned_at: user.banned_at || null,
      ban_until: user.ban_until || null,
      is_expired: user.ban_until && new Date(user.ban_until) < new Date()
    });
  } catch (err) {
    console.error('Check ban status error:', err);
    res.status(500).json({ error: 'Failed to check ban status' });
  }
});

// POST /api/admin/ban/unban/:user_id - Unban a user
router.post('/unban/:user_id', authenticate, requireRole('admin'), async (req, res) => {
  try {
    const { user_id } = req.params;

    const user = await getOne('SELECT id FROM users WHERE id = $1', [user_id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    await query(
      `UPDATE users
       SET banned = false,
           ban_reason = NULL,
           ban_type = NULL,
           ban_until = NULL
       WHERE id = $1`,
      [user_id]
    );

    res.json({
      message: 'User unbanned successfully',
      user_id
    });
  } catch (err) {
    console.error('Unban user error:', err);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

module.exports = router;
