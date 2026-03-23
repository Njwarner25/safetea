const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts - Get alerts by city
router.get('/', optionalAuth, async (req, res) => {
  const { city, type, severity } = req.query;
  let queryStr = 'SELECT * FROM alerts';
  const params = [];
  const conditions = [];
  let paramIdx = 1;

  if (city) { conditions.push(`city = $${paramIdx++}`); params.push(city); }
  if (type) { conditions.push(`type = $${paramIdx++}`); params.push(type); }
  if (severity) { conditions.push(`severity = $${paramIdx++}`); params.push(severity); }

  if (conditions.length > 0) {
    queryStr += ' WHERE ' + conditions.join(' AND ');
  }
  queryStr += ' ORDER BY created_at DESC';

  try {
    const alerts = await getAll(queryStr, params);
    res.json({ alerts });
  } catch (err) {
    console.error('Get alerts error:', err);
    res.status(500).json({ error: 'Failed to load alerts' });
  }
});

// POST /api/alerts - Create alert (moderator/admin only)
router.post('/', authenticate, requireRole('admin', 'moderator'), async (req, res) => {
  const { city, type, title, description, location, severity } = req.body;
  const id = uuidv4();

  try {
    await query(
      'INSERT INTO alerts (id, city, type, title, description, location, severity) VALUES ($1, $2, $3, $4, $5, $6, $7)',
      [id, city, type, title, description, location, severity || 'medium']
    );

    const alert = await getOne('SELECT * FROM alerts WHERE id = $1', [id]);
    res.status(201).json({ alert });
  } catch (err) {
    console.error('Create alert error:', err);
    res.status(500).json({ error: 'Failed to create alert' });
  }
});

// GET /api/alerts/stats - Get alert statistics
router.get('/stats', async (req, res) => {
  const { city } = req.query;
  let params = [];
  let whereClause = '';
  let paramIdx = 1;

  if (city) {
    whereClause = ` WHERE city = $${paramIdx++}`;
    params.push(city);
  }

  try {
    const total = await getOne('SELECT COUNT(*) as count FROM alerts' + whereClause, params);
    const byType = await getAll('SELECT type, COUNT(*) as count FROM alerts' + whereClause + ' GROUP BY type', params);
    const bySeverity = await getAll('SELECT severity, COUNT(*) as count FROM alerts' + whereClause + ' GROUP BY severity', params);

    res.json({ total: parseInt(total.count), byType, bySeverity });
  } catch (err) {
    console.error('Alert stats error:', err);
    res.status(500).json({ error: 'Failed to load alert stats' });
  }
});

module.exports = router;
