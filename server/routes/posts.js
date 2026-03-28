const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getOne, getAll, query } = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');

const { checkNewPostAgainstWatchedNames } = require('./namewatch');
const { analyzePost } = require('../services/ai-verification');

const router = express.Router();

// GET /api/posts - Get posts by city
router.get('/', optionalAuth, async (req, res) => {
  const { city, category, page = 1, limit = 20 } = req.query;
  const offset = (page - 1) * limit;

  let queryStr = 'SELECT p.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM posts p JOIN users u ON p.user_id = u.id';
  const params = [];
  const conditions = [];
  let paramIdx = 1;

  if (city) {
    conditions.push(`p.city = $${paramIdx++}`);
    params.push(city);
  }
  if (category) {
    conditions.push(`p.category = $${paramIdx++}`);
    params.push(category);
  }

  if (conditions.length > 0) {
    queryStr += ' WHERE ' + conditions.join(' AND ');
  }

  queryStr += ` ORDER BY p.created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`;
  params.push(parseInt(limit), parseInt(offset));

  try {
    const posts = await getAll(queryStr, params);

    // Get total count
    let countQuery = 'SELECT COUNT(*) as total FROM posts p';
    if (conditions.length > 0) {
      countQuery += ' WHERE ' + conditions.join(' AND ');
    }
    const countParams = params.slice(0, -2);
    const countResult = await getOne(countQuery, countParams);

    res.json({ posts, total: parseInt(countResult.total), page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Get posts error:', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// GET /api/posts/:id - Get single post with replies
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const post = await getOne(
      'SELECT p.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [req.params.id]
    );

    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const replies = await getAll(
      'SELECT r.*, u.avatar_initial, u.avatar_color, u.role as user_role FROM replies r JOIN users u ON r.user_id = u.id WHERE r.post_id = $1 ORDER BY r.created_at ASC',
      [req.params.id]
    );

    res.json({ post, replies });
  } catch (err) {
    console.error('Get post error:', err);
    res.status(500).json({ error: 'Failed to load post' });
  }
});

// POST /api/posts - Create new post
router.post('/', authenticate, [
  body('content').trim().isLength({ min: 10, max: 2000 }),
  body('city').trim().notEmpty(),
  body('category').optional().isIn(['general', 'warning', 'alert', 'question', 'positive'])
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { content, city, category = 'general', is_anonymous = true } = req.body;
  const id = uuidv4();

  try {
    await query(
      'INSERT INTO posts (id, user_id, city, content, category, is_anonymous) VALUES ($1, $2, $3, $4, $5, $6)',
      [id, req.user.id, city, content, category, is_anonymous]
    );

    const post = await getOne(
      'SELECT p.*, u.avatar_initial, u.avatar_color FROM posts p JOIN users u ON p.user_id = u.id WHERE p.id = $1',
      [id]
    );

    // Async: check new post against all watched names in this city
    checkNewPostAgainstWatchedNames(id, content, city).catch(err => {
      console.error('Name Watch matching error (non-blocking):', err);
    });

    // Async: AI story verification (non-blocking)
    analyzePost(id, content, city, req.user.id).catch(err => {
      console.error('AI verification error (non-blocking):', err);
    });

    res.status(201).json({ post });
  } catch (err) {
    console.error('Create post error:', err);
    res.status(500).json({ error: 'Failed to create post' });
  }
});

// POST /api/posts/:id/replies - Add reply to post
router.post('/:id/replies', authenticate, [
  body('content').trim().isLength({ min: 1, max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  try {
    const post = await getOne('SELECT id FROM posts WHERE id = $1', [req.params.id]);
    if (!post) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const id = uuidv4();
    const { content, is_anonymous = true } = req.body;

    await query(
      'INSERT INTO replies (id, post_id, user_id, content, is_anonymous) VALUES ($1, $2, $3, $4, $5)',
      [id, req.params.id, req.user.id, content, is_anonymous]
    );

    // Update reply count
    await query('UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1', [req.params.id]);

    const reply = await getOne(
      'SELECT r.*, u.avatar_initial, u.avatar_color FROM replies r JOIN users u ON r.user_id = u.id WHERE r.id = $1',
      [id]
    );
    res.status(201).json({ reply });
  } catch (err) {
    console.error('Create reply error:', err);
    res.status(500).json({ error: 'Failed to create reply' });
  }
});

module.exports = router;
