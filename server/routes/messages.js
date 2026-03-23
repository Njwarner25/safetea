const express = require('express');
const { getOne, getAll, query } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { requirePaid } = require('../middleware/requirePaid');

const router = express.Router();

// GET /api/messages — list conversations (grouped by other user)
router.get('/', authenticate, requirePaid, async (req, res) => {
  try {
    const userId = req.user.id;
    const conversations = await getAll(`
      WITH latest AS (
        SELECT
          CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_user_id,
          MAX(id) AS max_id
        FROM messages
        WHERE sender_id = $1 OR recipient_id = $1
        GROUP BY other_user_id
      )
      SELECT
        l.other_user_id,
        u.display_name AS other_name,
        u.avatar_initial AS other_avatar_initial,
        u.avatar_color AS other_avatar_color,
        u.custom_display_name AS other_custom_name,
        u.avatar_type AS other_avatar_type,
        m.content AS last_message,
        m.created_at AS last_message_at,
        (SELECT COUNT(*) FROM messages
         WHERE sender_id = l.other_user_id AND recipient_id = $1 AND is_read = false) AS unread_count
      FROM latest l
      JOIN messages m ON m.id = l.max_id
      JOIN users u ON u.id = l.other_user_id
      ORDER BY m.created_at DESC
    `, [userId]);

    res.json({ conversations });
  } catch (err) {
    console.error('Load conversations error:', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// GET /api/messages/unread/count — get total unread count (for badge)
router.get('/unread/count', authenticate, async (req, res) => {
  try {
    const result = await getOne(
      'SELECT COUNT(*) as count FROM messages WHERE recipient_id = $1 AND is_read = false',
      [req.user.id]
    );
    res.json({ unread: parseInt(result.count) });
  } catch (err) {
    res.json({ unread: 0 });
  }
});

// GET /api/messages/:userId — get message thread with specific user
router.get('/:userId', authenticate, requirePaid, async (req, res) => {
  try {
    const otherUserId = req.params.userId;

    const messages = await getAll(`
      SELECT m.id, m.sender_id, m.recipient_id, m.content, m.is_read, m.created_at,
        u.display_name AS sender_name, u.avatar_initial AS sender_avatar_initial,
        u.avatar_color AS sender_avatar_color, u.custom_display_name AS sender_custom_name
      FROM messages m
      JOIN users u ON u.id = m.sender_id
      WHERE (m.sender_id = $1 AND m.recipient_id = $2)
         OR (m.sender_id = $2 AND m.recipient_id = $1)
      ORDER BY m.created_at ASC
    `, [req.user.id, otherUserId]);

    // Mark messages from the other user as read
    await query(`
      UPDATE messages SET is_read = true
      WHERE sender_id = $1 AND recipient_id = $2 AND is_read = false
    `, [otherUserId, req.user.id]);

    const otherUser = await getOne(
      'SELECT id, display_name, avatar_initial, avatar_color, custom_display_name, avatar_type FROM users WHERE id = $1',
      [otherUserId]
    );

    res.json({ messages, otherUser: otherUser || null });
  } catch (err) {
    console.error('Load thread error:', err);
    res.status(500).json({ error: 'Failed to load messages' });
  }
});

// POST /api/messages — send a message
router.post('/', authenticate, requirePaid, async (req, res) => {
  const { recipient_id, content } = req.body;

  if (!recipient_id || !content || !content.trim()) {
    return res.status(400).json({ error: 'Recipient and content are required' });
  }

  if (content.trim().length > 2000) {
    return res.status(400).json({ error: 'Message must be under 2000 characters' });
  }

  if (recipient_id === req.user.id) {
    return res.status(400).json({ error: 'Cannot message yourself' });
  }

  try {
    const recipient = await getOne('SELECT id FROM users WHERE id = $1', [recipient_id]);
    if (!recipient) {
      return res.status(404).json({ error: 'Recipient not found' });
    }

    const result = await query(`
      INSERT INTO messages (sender_id, recipient_id, content) VALUES ($1, $2, $3) RETURNING *
    `, [req.user.id, recipient_id, content.trim()]);

    res.status(201).json({ message: result.rows[0] });
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

// PUT /api/messages/:id/read — mark a message as read
router.put('/:id/read', authenticate, async (req, res) => {
  try {
    const msg = await getOne('SELECT * FROM messages WHERE id = $1', [req.params.id]);
    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }
    if (msg.recipient_id !== req.user.id) {
      return res.status(403).json({ error: 'Can only mark your own messages as read' });
    }

    await query('UPDATE messages SET is_read = true WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Mark read error:', err);
    res.status(500).json({ error: 'Failed to mark message as read' });
  }
});

module.exports = router;
