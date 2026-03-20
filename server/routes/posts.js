const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const db = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const router = express.Router();

// GET /api/posts - Get posts by city
router.get('/', optionalAuth, (req, res) => {
    const { city, category, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

             let query = 'SELECT p.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM posts p JOIN users u ON p.user_id = u.id';
    const params = [];
    const conditions = [];

             if (city) {
                   conditions.push('p.city = ?');
                   params.push(city);
             }
    if (category) {
          conditions.push('p.category = ?');
          params.push(category);
    }

             if (conditions.length > 0) {
                   query += ' WHERE ' + conditions.join(' AND ');
             }

             query += ' ORDER BY p.created_at DESC LIMIT ? OFFSET ?';
    params.push(parseInt(limit), parseInt(offset));

             const posts = db.prepare(query).all(...params);

             // Get total count
             let countQuery = 'SELECT COUNT(*) as total FROM posts p';
    if (conditions.length > 0) {
          countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, -2);
    const { total } = db.prepare(countQuery).get(...countParams);

             res.json({ posts, total, page: parseInt(page), limit: parseInt(limit) });
});

// GET /api/posts/:id - Get single post with replies
router.get('/:id', optionalAuth, (req, res) => {
    const post = db.prepare('SELECT p.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(req.params.id);

             if (!post) {
                   return res.status(404).json({ error: 'Post not found' });
             }

             const replies = db.prepare('SELECT r.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM replies r JOIN users u ON r.user_id = u.id WHERE r.post_id = ? ORDER BY r.created_at ASC').all(req.params.id);

             res.json({ post, replies });
});

// POST /api/posts - Create new post
router.post('/', authenticate, [
    body('content').trim().isLength({ min: 10, max: 2000 }),
    body('city').trim().notEmpty(),
    body('category').optional().isIn(['general', 'warning', 'alert', 'question', 'positive'])
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
    }

              const { content, city, category = 'general', is_anonymous = true } = req.body;
    const id = uuidv4();

              try {
                    db.prepare('INSERT INTO posts (id, user_id, city, content, category, is_anonymous) VALUES (?, ?, ?, ?, ?, ?)').run(id, req.user.id, city, content, category, is_anonymous ? 1 : 0);

      const post = db.prepare('SELECT p.*, u.avatar_initial, u.avatar_color FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = ?').get(id);
                    res.status(201).json({ post });
              } catch (err) {
                    console.error('Create post error:', err);
                    res.status(500).json({ error: 'Failed to create post' });
              }
});

// POST /api/posts/:id/replies - Add reply to post
router.post('/:id/replies', authenticate, [
    body('content').trim().isLength({ min: 1, max: 1000 })
  ], (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
    }

              const post = db.prepare('SELECT id FROM posts WHERE id = ?').get(req.params.id);
    if (!post) {
          return res.status(404).json({ error: 'Post not found' });
    }

              const id = uuidv4();
    const { content, is_anonymous = true } = req.body;

              try {
                    db.prepare('INSERT INTO replies (id, post_id, user_id, content, is_anonymous) VALUES (?, ?, ?, ?, ?)').run(id, req.params.id, req.user.id, content, is_anonymous ? 1 : 0);

      // Update reply count
      db.prepare('UPDATE posts SET reply_count = reply_count + 1 WHERE id = ?').run(req.params.id);

      const reply = db.prepare('SELECT r.*, u.avatar_initial, u.avatar_color FROM replies r JOIN users u ON r.user_id = u.id WHERE r.id = ?').get(id);
                    res.status(201).json({ reply });
              } catch (err) {
                    console.error('Create reply error:', err);
                    res.status(500).json({ error: 'Failed to create reply' });
              }
});

module.exports = router;
