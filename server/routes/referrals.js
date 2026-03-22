const express = require('express');
const db = require('../db/database');
const { authenticate, optionalAuth } = require('../middleware/auth');
const { requirePaid } = require('../middleware/requirePaid');

const router = express.Router();

// GET /api/referrals — list all referrals (public, paginated)
router.get('/', optionalAuth, (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const offset = (parseInt(page) - 1) * parseInt(limit);

  try {
    const referrals = db.prepare(`
      SELECT r.*, u.display_name AS referrer_name, u.avatar_initial, u.avatar_color,
        u.custom_display_name, u.avatar_type
      FROM referrals r
      JOIN users u ON u.id = r.referrer_id
      ORDER BY r.created_at DESC
      LIMIT ? OFFSET ?
    `).all(parseInt(limit), offset);

    const { total } = db.prepare('SELECT COUNT(*) as total FROM referrals').get();

    res.json({ referrals, total, page: parseInt(page), limit: parseInt(limit) });
  } catch (err) {
    console.error('Load referrals error:', err);
    res.status(500).json({ error: 'Failed to load referrals' });
  }
});

// GET /api/referrals/:id — get single referral
router.get('/:id', optionalAuth, (req, res) => {
  try {
    const referral = db.prepare(`
      SELECT r.*, u.display_name AS referrer_name, u.avatar_initial, u.avatar_color,
        u.custom_display_name, u.avatar_type
      FROM referrals r
      JOIN users u ON u.id = r.referrer_id
      WHERE r.id = ?
    `).get(req.params.id);

    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    res.json({ referral });
  } catch (err) {
    console.error('Get referral error:', err);
    res.status(500).json({ error: 'Failed to load referral' });
  }
});

// POST /api/referrals — submit a referral (any authenticated user)
router.post('/', authenticate, (req, res) => {
  const { person_name, person_city, person_state, relationship, description } = req.body;

  if (!person_name || !person_name.trim()) {
    return res.status(400).json({ error: 'Person name is required' });
  }
  if (!description || !description.trim()) {
    return res.status(400).json({ error: 'Description is required' });
  }
  if (description.trim().length > 2000) {
    return res.status(400).json({ error: 'Description must be under 2000 characters' });
  }

  try {
    const result = db.prepare(`
      INSERT INTO referrals (referrer_id, person_name, person_city, person_state, relationship, description)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      req.user.id,
      person_name.trim(),
      person_city ? person_city.trim() : null,
      person_state ? person_state.trim() : null,
      relationship || null,
      description.trim()
    );

    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ referral });
  } catch (err) {
    console.error('Create referral error:', err);
    res.status(500).json({ error: 'Failed to create referral' });
  }
});

// POST /api/referrals/:id/photo — add photo to referral (premium only)
router.post('/:id/photo', authenticate, requirePaid, (req, res) => {
  const { photo_url } = req.body;

  if (!photo_url) {
    return res.status(400).json({ error: 'Photo URL is required' });
  }

  try {
    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }
    if (referral.referrer_id !== req.user.id) {
      return res.status(403).json({ error: 'Only the referrer can add a photo' });
    }

    db.prepare('UPDATE referrals SET photo_url = ? WHERE id = ?').run(photo_url, req.params.id);

    const updated = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    res.json({ referral: updated });
  } catch (err) {
    console.error('Add photo error:', err);
    res.status(500).json({ error: 'Failed to add photo' });
  }
});

// POST /api/referrals/:id/vouch — vouch for an existing referral
router.post('/:id/vouch', authenticate, (req, res) => {
  try {
    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    db.prepare('UPDATE referrals SET vouch_count = vouch_count + 1 WHERE id = ?').run(req.params.id);

    const updated = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    res.json({ referral: updated });
  } catch (err) {
    console.error('Vouch error:', err);
    res.status(500).json({ error: 'Failed to vouch' });
  }
});

// POST /api/referrals/:id/message — message the referrer about this person (premium only)
router.post('/:id/message', authenticate, requirePaid, (req, res) => {
  const { content } = req.body;

  if (!content || !content.trim()) {
    return res.status(400).json({ error: 'Message content is required' });
  }

  try {
    const referral = db.prepare('SELECT * FROM referrals WHERE id = ?').get(req.params.id);
    if (!referral) {
      return res.status(404).json({ error: 'Referral not found' });
    }

    if (referral.referrer_id === req.user.id) {
      return res.status(400).json({ error: 'Cannot message yourself about your own referral' });
    }

    // Create a message to the referrer via the inbox system
    const result = db.prepare(`
      INSERT INTO messages (sender_id, recipient_id, content) VALUES (?, ?, ?)
    `).run(req.user.id, referral.referrer_id, content.trim());

    const message = db.prepare('SELECT * FROM messages WHERE id = ?').get(result.lastInsertRowid);
    res.status(201).json({ message });
  } catch (err) {
    console.error('Message referrer error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

module.exports = router;
