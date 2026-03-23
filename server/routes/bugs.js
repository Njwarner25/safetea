const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// Valid categories for bug reports
const VALID_CATEGORIES = ['crash', 'visual', 'feature_broken', 'performance', 'other'];
const VALID_STATUSES = ['new', 'triaging', 'in_progress', 'resolved', 'wont_fix'];
const VALID_PRIORITIES = ['low', 'medium', 'high', 'critical'];

// Helper function to require admin role
function requireAdmin(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  return next();
}

// POST /api/bugs - Submit a new bug report (auth required)
router.post('/', authenticate, async (req, res) => {
  const { category, description, screenshot, device_model, os_version, app_version, build_number, screen_trail, network_type } = req.body;
  const userId = req.user.id;
  const id = uuidv4();

  try {
    // Validation: category must be valid enum
    if (!category || !VALID_CATEGORIES.includes(category)) {
      return res.status(400).json({ error: 'Invalid category. Must be one of: ' + VALID_CATEGORIES.join(', ') });
    }

    // Validation: description must be present and under 500 chars
    if (!description || typeof description !== 'string') {
      return res.status(400).json({ error: 'Description is required' });
    }
    if (description.length > 500) {
      return res.status(400).json({ error: 'Description must be 500 characters or less' });
    }

    // Check for auto-escalation: 5+ reports with same category in last 24 hours
    let priority = 'low';
    const escalationCheck = await getOne(
      `SELECT COUNT(*) as count FROM bug_reports
       WHERE category = $1 AND created_at >= NOW() - INTERVAL '24 hours'`,
      [category]
    );

    if (parseInt(escalationCheck.count) >= 5) {
      priority = 'critical';
    }

    // Insert bug report
    await query(
      `INSERT INTO bug_reports (id, user_id, category, description, screenshot, device_model, os_version, app_version, build_number, screen_trail, network_type, status, priority)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)`,
      [id, userId, category, description, screenshot || null, device_model || null, os_version || null, app_version || null, build_number || null, screen_trail ? JSON.stringify(screen_trail) : null, network_type || null, 'new', priority]
    );

    // Fetch the created report
    const bugReport = await getOne('SELECT id, category, status, priority, created_at FROM bug_reports WHERE id = $1', [id]);

    res.status(201).json({
      bug: bugReport,
      message: "Thanks! We're on it."
    });
  } catch (err) {
    console.error('Create bug report error:', err);
    res.status(500).json({ error: 'Failed to submit bug report' });
  }
});

// GET /api/bugs/mine - Get current user's bug reports (auth required, paginated)
router.get('/mine', authenticate, async (req, res) => {
  const userId = req.user.id;
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 20, 100);
  const offset = (page - 1) * limit;

  try {
    // Get total count
    const countResult = await getOne(
      'SELECT COUNT(*) as count FROM bug_reports WHERE user_id = $1',
      [userId]
    );

    // Get paginated results
    const bugReports = await getAll(
      `SELECT id, category, description, status, priority, device_model, os_version, app_version, created_at, resolved_at
       FROM bug_reports
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT $2 OFFSET $3`,
      [userId, limit, offset]
    );

    res.json({
      bugs: bugReports,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.count),
        totalPages: Math.ceil(parseInt(countResult.count) / limit)
      }
    });
  } catch (err) {
    console.error('Get user bug reports error:', err);
    res.status(500).json({ error: 'Failed to load bug reports' });
  }
});

// GET /api/admin/bugs - Get all bug reports (admin only, paginated, filterable, sortable)
router.get('/admin', authenticate, requireAdmin, async (req, res) => {
  const page = parseInt(req.query.page) || 1;
  const limit = Math.min(parseInt(req.query.limit) || 50, 100);
  const offset = (page - 1) * limit;
  const status = req.query.status || '';
  const priority = req.query.priority || '';
  const category = req.query.category || '';
  const dateFrom = req.query.dateFrom || '';
  const dateTo = req.query.dateTo || '';
  const sortBy = req.query.sortBy || 'created_at'; // created_at or priority
  const sortOrder = req.query.sortOrder === 'asc' ? 'ASC' : 'DESC';

  try {
    // Build WHERE clause and params
    let whereClause = 'WHERE 1=1';
    const params = [];
    let paramIndex = 1;

    if (status) {
      whereClause += ` AND status = $${paramIndex}`;
      params.push(status);
      paramIndex++;
    }

    if (priority) {
      whereClause += ` AND priority = $${paramIndex}`;
      params.push(priority);
      paramIndex++;
    }

    if (category) {
      whereClause += ` AND category = $${paramIndex}`;
      params.push(category);
      paramIndex++;
    }

    if (dateFrom) {
      whereClause += ` AND created_at >= $${paramIndex}`;
      params.push(dateFrom);
      paramIndex++;
    }

    if (dateTo) {
      whereClause += ` AND created_at <= $${paramIndex}`;
      params.push(dateTo);
      paramIndex++;
    }

    // Get total count
    const countResult = await getOne(
      `SELECT COUNT(*) as count FROM bug_reports ${whereClause}`,
      params
    );

    // Validate sortBy
    const validSortFields = ['created_at', 'priority'];
    const finalSortBy = validSortFields.includes(sortBy) ? sortBy : 'created_at';

    // Get paginated results with user info
    const bugReports = await getAll(
      `SELECT br.id, br.user_id, u.display_name, u.email, br.category, br.description, br.status, br.priority,
              br.device_model, br.os_version, br.app_version, br.build_number, br.network_type,
              br.screenshot, br.screen_trail, br.created_at, br.resolved_at
       FROM bug_reports br
       LEFT JOIN users u ON br.user_id = u.id
       ${whereClause}
       ORDER BY br.${finalSortBy} ${sortOrder}
       LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
      [...params, limit, offset]
    );

    res.json({
      bugs: bugReports,
      pagination: {
        page,
        limit,
        total: parseInt(countResult.count),
        totalPages: Math.ceil(parseInt(countResult.count) / limit)
      }
    });
  } catch (err) {
    console.error('Get all bug reports error:', err);
    res.status(500).json({ error: 'Failed to load bug reports' });
  }
});

// PATCH /api/admin/bugs/:id - Update bug report status/priority (admin only)
router.patch('/admin/:id', authenticate, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { status, priority } = req.body;

  try {
    // Get current bug report
    const bugReport = await getOne('SELECT * FROM bug_reports WHERE id = $1', [id]);
    if (!bugReport) {
      return res.status(404).json({ error: 'Bug report not found' });
    }

    // Validate status if provided
    if (status && !VALID_STATUSES.includes(status)) {
      return res.status(400).json({ error: 'Invalid status. Must be one of: ' + VALID_STATUSES.join(', ') });
    }

    // Validate priority if provided
    if (priority && !VALID_PRIORITIES.includes(priority)) {
      return res.status(400).json({ error: 'Invalid priority. Must be one of: ' + VALID_PRIORITIES.join(', ') });
    }

    // Build update query
    let updateQuery = 'UPDATE bug_reports SET ';
    const updateParams = [];
    let paramIndex = 1;
    const updates = [];

    if (status) {
      updates.push(`status = $${paramIndex}`);
      updateParams.push(status);
      paramIndex++;

      // If status is 'resolved', set resolved_at to NOW()
      if (status === 'resolved') {
        updates.push(`resolved_at = NOW()`);
      }
    }

    if (priority) {
      updates.push(`priority = $${paramIndex}`);
      updateParams.push(priority);
      paramIndex++;
    }

    if (updates.length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    updateQuery += updates.join(', ') + ` WHERE id = $${paramIndex}`;
    updateParams.push(id);

    // Execute update
    await query(updateQuery, updateParams);

    // Fetch updated report
    const updatedReport = await getOne('SELECT * FROM bug_reports WHERE id = $1', [id]);

    res.json({
      bug: updatedReport,
      message: 'Bug report updated successfully'
    });
  } catch (err) {
    console.error('Update bug report error:', err);
    res.status(500).json({ error: 'Failed to update bug report' });
  }
});

module.exports = router;
