const express = require('express');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, query } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// GET /api/strikes/me - Get current user's strikes and suspension status
router.get('/me', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // Get strikes
    const strikes = await getAll(
      `SELECT id, strike_reason, strike_count, suspension_end, appeal_status, created_at
       FROM user_strikes
       WHERE user_id = $1
       ORDER BY created_at DESC`,
      [userId]
    );

    // Get user suspension status
    const user = await getOne(
      `SELECT is_suspended, suspension_end FROM users WHERE id = $1`,
      [userId]
    );

    // Check if suspension has expired
    let isSuspended = user?.is_suspended || false;
    let activeSuspension = null;

    if (isSuspended && user.suspension_end) {
      const suspensionEnd = new Date(user.suspension_end);
      const now = new Date();

      if (suspensionEnd <= now) {
        // Suspension has expired, auto-lift it
        await query('UPDATE users SET is_suspended = false, suspension_end = NULL WHERE id = $1', [userId]);
        isSuspended = false;
      } else {
        activeSuspension = {
          suspension_end: suspensionEnd,
          days_remaining: Math.ceil((suspensionEnd - now) / (1000 * 60 * 60 * 24))
        };
      }
    }

    res.json({
      strikes,
      is_suspended: isSuspended,
      active_suspension: activeSuspension
    });
  } catch (err) {
    console.error('Get strikes error:', err);
    res.status(500).json({ error: 'Failed to retrieve strike information' });
  }
});

// POST /api/appeals - Submit an appeal for a strike
router.post('/', authenticate, [
  body('strike_id').notEmpty().withMessage('Strike ID is required'),
  body('reason').trim().isLength({ min: 10, max: 2000 }).withMessage('Reason must be between 10 and 2000 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { strike_id, reason } = req.body;
  const userId = req.user.id;

  try {
    // Verify strike belongs to user
    const strike = await getOne(
      `SELECT id, user_id, appeal_status FROM user_strikes WHERE id = $1`,
      [strike_id]
    );

    if (!strike) {
      return res.status(404).json({ error: 'Strike not found' });
    }

    if (strike.user_id !== userId) {
      return res.status(403).json({ error: 'You can only appeal your own strikes' });
    }

    if (strike.appeal_status && strike.appeal_status !== 'denied') {
      return res.status(409).json({ error: 'This strike already has an active or approved appeal' });
    }

    // Create appeal
    const appealId = uuidv4();
    await query(
      `UPDATE user_strikes
       SET appeal_status = $1, appeal_reason = $2, appeal_submitted_at = NOW(), appeal_id = $3
       WHERE id = $4`,
      ['pending', reason, appealId, strike_id]
    );

    res.status(201).json({
      message: 'Appeal submitted successfully',
      appeal_id: appealId,
      appeal_status: 'pending'
    });
  } catch (err) {
    console.error('Appeal submission error:', err);
    res.status(500).json({ error: 'Failed to submit appeal' });
  }
});

// GET /api/admin/strikes - List all strikes (admin only)
router.get('/admin/list', authenticate, async (req, res) => {
  // Check admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    const strikes = await getAll(
      `SELECT
        s.id,
        s.user_id,
        u.email,
        u.display_name,
        s.strike_reason,
        s.strike_count,
        s.suspension_end,
        s.appeal_status,
        s.created_at,
        s.appeal_reason,
        s.appeal_submitted_at
       FROM user_strikes s
       JOIN users u ON s.user_id = u.id
       ORDER BY s.created_at DESC
       LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    // Get total count
    const countResult = await getOne('SELECT COUNT(*) as count FROM user_strikes');
    const total = countResult?.count || 0;

    res.json({
      data: strikes,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Admin strikes list error:', err);
    res.status(500).json({ error: 'Failed to retrieve strikes' });
  }
});

// PATCH /api/admin/strikes/:id/appeal - Review and decide on appeal (admin only)
router.patch('/:id/appeal', authenticate, [
  body('decision').isIn(['approved', 'denied']),
  body('notes').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  // Check admin role
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { decision, notes } = req.body;

  try {
    const strike = await getOne(
      `SELECT id, user_id, appeal_status FROM user_strikes WHERE id = $1`,
      [id]
    );

    if (!strike) {
      return res.status(404).json({ error: 'Strike not found' });
    }

    if (strike.appeal_status !== 'pending') {
      return res.status(409).json({ error: 'This strike does not have a pending appeal' });
    }

    // Update appeal status
    await query(
      `UPDATE user_strikes
       SET appeal_status = $1, appeal_decision_notes = $2, appeal_decided_at = NOW()
       WHERE id = $3`,
      [decision, notes || null, id]
    );

    // If approved, lift suspension for this strike
    if (decision === 'approved') {
      await query(
        `UPDATE users SET is_suspended = false, suspension_end = NULL WHERE id = $1`,
        [strike.user_id]
      );
    }

    const updated = await getOne(
      `SELECT id, user_id, appeal_status, appeal_decision_notes FROM user_strikes WHERE id = $1`,
      [id]
    );

    res.json({
      message: `Appeal ${decision}`,
      strike: updated
    });
  } catch (err) {
    console.error('Admin appeal review error:', err);
    res.status(500).json({ error: 'Failed to process appeal' });
  }
});

module.exports = router;
