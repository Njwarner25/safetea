const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

const SUGGESTION_VOTE_THRESHOLD = parseInt(process.env.SUGGESTION_VOTE_THRESHOLD) || 50;

// Middleware: require admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// POST /api/suggestions - Create new suggestion
router.post('/', authenticate, [
  body('title').trim().isLength({ min: 1, max: 60 }),
  body('description').trim().isLength({ min: 1, max: 500 }),
  body('city_id').optional().isUUID()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { title, description, city_id } = req.body;
  const id = uuidv4();

  try {
    await query(
      'INSERT INTO suggestions (id, user_id, title, description, city_id, status, vote_count) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, req.user.id, title, description, city_id || null, 'pending_moderation', 0]
    );

    const suggestion = await getOne(
      'SELECT id, title, description, status, created_at FROM suggestions WHERE id = $1',
      [id]
    );

    res.status(201).json({
      suggestion,
      message: 'Your suggestion has been submitted for review!'
    });
  } catch (err) {
    console.error('Create suggestion error:', err);
    res.status(500).json({ error: 'Failed to create suggestion' });
  }
});

// GET /api/suggestions - List suggestions with pagination and filtering
router.get('/', optionalAuth, async (req, res) => {
  const {
    page = 1,
    limit = 20,
    sort = 'vote_count',
    status
  } = req.query;

  const offset = (page - 1) * limit;
  const validSorts = ['vote_count', 'created_at'];
  const sortBy = validSorts.includes(sort) ? sort : 'vote_count';

  let queryStr = 'SELECT s.*, u.display_name, u.avatar_initial, u.avatar_color FROM suggestions s JOIN users u ON s.user_id = u.id';
  const params = [];
  const conditions = [];
  let paramIdx = 1;

  // Determine allowed statuses based on auth
  const allowedStatuses = req.user && req.user.role === 'admin'
    ? ['pending_moderation', 'approved', 'under_review', 'planned', 'in_progress', 'shipped', 'declined']
    : ['approved', 'under_review', 'planned', 'in_progress', 'shipped'];

  // Apply status filter if provided
  if (status && allowedStatuses.includes(status)) {
    conditions.push(`s.status = $${paramIdx++}`);
    params.push(status);
  } else if (!req.user || req.user.role !== 'admin') {
    // For public/non-admin users, apply default status filter
    const statusPlaceholders = allowedStatuses.map((_, i) => `$${paramIdx + i}`).join(', ');
    conditions.push(`s.status IN (${statusPlaceholders})`);
    params.push(...allowedStatuses);
    paramIdx += allowedStatuses.length;
  }

  if (conditions.length > 0) {
    queryStr += ' WHERE ' + conditions.join(' AND ');
  }

  queryStr += ` ORDER BY s.${sortBy} DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(parseInt(limit), parseInt(offset));

  try {
    const suggestions = await getAll(queryStr, params);

    // If authenticated, check which suggestions user has voted on
    if (req.user) {
      const suggestionIds = suggestions.map(s => s.id);
      if (suggestionIds.length > 0) {
        const placeholders = suggestionIds.map((_, i) => `$${i + 1}`).join(', ');
        const userVotes = await getAll(
          `SELECT suggestion_id FROM suggestion_votes WHERE user_id = $${suggestionIds.length + 1} AND suggestion_id IN (${placeholders})`,
          [...suggestionIds, req.user.id]
        );
        const votedIds = new Set(userVotes.map(v => v.suggestion_id));
        suggestions.forEach(s => {
          s.user_voted = votedIds.has(s.id);
        });
      }
    }

    // Get total count (exclude limit/offset params)
    let countQuery = 'SELECT COUNT(*) as total FROM suggestions s';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, params.length - 2);
    const countResult = await getOne(countQuery, countParams);

    res.json({
      suggestions,
      total: parseInt(countResult.total),
      page: parseInt(page),
      limit: parseInt(limit)
    });
  } catch (err) {
    console.error('Get suggestions error:', err);
    res.status(500).json({ error: 'Failed to load suggestions' });
  }
});

// GET /api/suggestions/mine - Get user's own suggestions
router.get('/mine', authenticate, async (req, res) => {
  try {
    const suggestions = await getAll(
      'SELECT * FROM suggestions WHERE user_id = $1 ORDER BY created_at DESC',
      [req.user.id]
    );

    res.json({ suggestions });
  } catch (err) {
    console.error('Get user suggestions error:', err);
    res.status(500).json({ error: 'Failed to load your suggestions' });
  }
});

// POST /api/suggestions/:id/vote - Toggle vote on suggestion
router.post('/:id/vote', authenticate, async (req, res) => {
  try {
    // Check if suggestion exists
    const suggestion = await getOne(
      'SELECT id, status, vote_count FROM suggestions WHERE id = $1',
      [req.params.id]
    );

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Check if user has already voted
    const existingVote = await getOne(
      'SELECT id FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );

    if (existingVote) {
      // Remove vote
      await query(
        'DELETE FROM suggestion_votes WHERE suggestion_id = $1 AND user_id = $2',
        [req.params.id, req.user.id]
      );
      await query(
        'UPDATE suggestions SET vote_count = vote_count - 1 WHERE id = $1',
        [req.params.id]
      );

      const updatedSuggestion = await getOne(
        'SELECT vote_count FROM suggestions WHERE id = $1',
        [req.params.id]
      );

      res.json({
        voted: false,
        vote_count: updatedSuggestion.vote_count
      });
    } else {
      // Add vote
      const voteId = uuidv4();
      await query(
        'INSERT INTO suggestion_votes (id, suggestion_id, user_id) VALUES ($1, $2, $3)',
        [voteId, req.params.id, req.user.id]
      );
      await query(
        'UPDATE suggestions SET vote_count = vote_count + 1 WHERE id = $1',
        [req.params.id]
      );

      // Check if vote threshold reached
      const updatedSuggestion = await getOne(
        'SELECT vote_count, status FROM suggestions WHERE id = $1',
        [req.params.id]
      );

      if (
        updatedSuggestion.vote_count >= SUGGESTION_VOTE_THRESHOLD &&
        updatedSuggestion.status === 'approved'
      ) {
        await query(
          'UPDATE suggestions SET status = $1, flagged_at = NOW() WHERE id = $2',
          ['under_review', req.params.id]
        );
      }

      res.json({
        voted: true,
        vote_count: updatedSuggestion.vote_count
      });
    }
  } catch (err) {
    console.error('Toggle vote error:', err);
    res.status(500).json({ error: 'Failed to process vote' });
  }
});

// PATCH /api/admin/suggestions/:id - Update suggestion status (admin only)
router.patch('/:id', authenticate, requireAdmin, [
  body('status').isIn(['pending_moderation', 'approved', 'under_review', 'planned', 'in_progress', 'shipped', 'declined'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { status } = req.body;

  try {
    const suggestion = await getOne(
      'SELECT id FROM suggestions WHERE id = $1',
      [req.params.id]
    );

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    await query(
      'UPDATE suggestions SET status = $1 WHERE id = $2',
      [status, req.params.id]
    );

    const updatedSuggestion = await getOne(
      'SELECT * FROM suggestions WHERE id = $1',
      [req.params.id]
    );

    res.json({ suggestion: updatedSuggestion });
  } catch (err) {
    console.error('Update suggestion error:', err);
    res.status(500).json({ error: 'Failed to update suggestion' });
  }
});

// DELETE /api/admin/suggestions/:id - Delete suggestion (admin only)
router.delete('/:id', authenticate, requireAdmin, async (req, res) => {
  try {
    const suggestion = await getOne(
      'SELECT id FROM suggestions WHERE id = $1',
      [req.params.id]
    );

    if (!suggestion) {
      return res.status(404).json({ error: 'Suggestion not found' });
    }

    // Delete votes first (foreign key constraint)
    await query(
      'DELETE FROM suggestion_votes WHERE suggestion_id = $1',
      [req.params.id]
    );

    // Delete suggestion
    await query(
      'DELETE FROM suggestions WHERE id = $1',
      [req.params.id]
    );

    res.status(204).send();
  } catch (err) {
    console.error('Delete suggestion error:', err);
    res.status(500).json({ error: 'Failed to delete suggestion' });
  }
});

module.exports = router;
