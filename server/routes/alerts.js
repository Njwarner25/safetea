const express = require('express');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/database');
const { authenticate, optionalAuth, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/alerts - Get alerts by city
router.get('/', optionalAuth, (req, res) => {
    const { city, type, severity } = req.query;
    let query = 'SELECT * FROM alerts';
    const params = [];
    const conditions = [];

             if (city) { conditions.push('city = ?'); params.push(city); }
    if (type) { conditions.push('type = ?'); params.push(type); }
    if (severity) { conditions.push('severity = ?'); params.push(severity); }

             if (conditions.length > 0) {
                   query += ' WHERE ' + conditions.join(' AND ');
             }
    query += ' ORDER BY created_at DESC';

             const alerts = db.prepare(query).all(...params);
    res.json({ alerts });
});

// POST /api/alerts - Create alert (moderator/admin only)
router.post('/', authenticate, requireRole('admin', 'moderator'), (req, res) => {
    const { city, type, title, description, location, severity } = req.body;
    const id = uuidv4();

              try {
                    db.prepare('INSERT INTO alerts (id, city, type, title, description, location, severity) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, city, type, title, description, location, severity || 'medium');

      const alert = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id);
                    res.status(201).json({ alert });
              } catch (err) {
                    console.error('Create alert error:', err);
                    res.status(500).json({ error: 'Failed to create alert' });
              }
});

// GET /api/alerts/stats - Get alert statistics
router.get('/stats', (req, res) => {
    const { city } = req.query;
    let params = [];
    let whereClause = '';

             if (city) {
                   whereClause = ' WHERE city = ?';
                   params.push(city);
             }

             const total = db.prepare('SELECT COUNT(*) as count FROM alerts' + whereClause).get(...params);
    const byType = db.prepare('SELECT type, COUNT(*) as count FROM alerts' + whereClause + ' GROUP BY type').all(...params);
    const bySeverity = db.prepare('SELECT severity, COUNT(*) as count FROM alerts' + whereClause + ' GROUP BY severity').all(...params);

             res.json({ total: total.count, byType, bySeverity });
});

module.exports = router;
