const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // ========== GET: List conversations ==========
  if (req.method === 'GET') {
    try {
      const conversations = await getMany(
        `WITH ranked AS (
          SELECT
            CASE WHEN sender_id = $1 THEN recipient_id ELSE sender_id END AS other_id,
            content,
            created_at,
            is_read,
            recipient_id,
            is_system,
            ROW_NUMBER() OVER (
              PARTITION BY LEAST(sender_id, recipient_id), GREATEST(sender_id, recipient_id)
              ORDER BY created_at DESC
            ) AS rn
          FROM messages
          WHERE sender_id = $1 OR recipient_id = $1
        )
        SELECT
          r.other_id AS other_user_id,
          u.display_name AS other_name,
          u.custom_display_name AS other_custom_name,
          u.avatar_color AS other_avatar_color,
          MAX(CASE WHEN r.rn = 1 THEN r.content END) AS last_message,
          MAX(r.created_at) AS last_message_at,
          COUNT(*) FILTER (WHERE r.is_read = false AND r.recipient_id = $1) AS unread_count,
          BOOL_OR(r.is_system) AS is_system
        FROM ranked r
        JOIN users u ON u.id = r.other_id
        GROUP BY r.other_id, u.display_name, u.custom_display_name, u.avatar_color
        ORDER BY last_message_at DESC`,
        [user.id]
      );

      return res.status(200).json({ conversations });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load conversations', details: err.message });
    }
  }

  // ========== DELETE: Delete a message ==========
  if (req.method === 'DELETE') {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const msgId = url.searchParams.get('id');
    if (!msgId) return res.status(400).json({ error: 'Message ID required' });

    try {
      await run(
        'DELETE FROM messages WHERE id = $1 AND (sender_id = $2 OR recipient_id = $2)',
        [msgId, user.id]
      );
      return res.status(200).json({ success: true });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete message', details: err.message });
    }
  }

  // ========== POST: Send a message ==========
  if (req.method === 'POST') {
    const body = req.body || {};
    const { recipient_id, content } = body;

    if (!recipient_id || !content || !content.trim()) {
      return res.status(400).json({ error: 'recipient_id and content are required' });
    }

    if (parseInt(recipient_id) === user.id) {
      return res.status(400).json({ error: 'Cannot message yourself' });
    }

    try {
      const recipient = await getOne('SELECT id FROM users WHERE id = $1', [recipient_id]);
      if (!recipient) return res.status(404).json({ error: 'Recipient not found' });

      const msg = await getOne(
        `INSERT INTO messages (sender_id, recipient_id, content, created_at)
         VALUES ($1, $2, $3, NOW())
         RETURNING id, created_at`,
        [user.id, recipient_id, content.trim()]
      );

      return res.status(201).json({ message: 'Message sent', id: msg.id, created_at: msg.created_at });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to send message', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
