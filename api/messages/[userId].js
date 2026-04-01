const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { userId } = req.query;
  if (!userId) return res.status(400).json({ error: 'userId required' });

  // ========== GET: Load thread with a specific user ==========
  if (req.method === 'GET') {
    try {
      // Self-thread: system messages (SafeTea Alerts)
      if (parseInt(userId) === user.id) {
        const messages = await getMany(
          `SELECT id, sender_id, recipient_id, content, is_read, is_system, system_type, created_at
           FROM messages
           WHERE sender_id = $1 AND recipient_id = $1 AND is_system = true
           ORDER BY created_at ASC`,
          [user.id]
        );

        // Mark all as read
        await run(
          `UPDATE messages SET is_read = true
           WHERE sender_id = $1 AND recipient_id = $1 AND is_system = true AND is_read = false`,
          [user.id]
        );

        return res.status(200).json({
          otherUser: { id: user.id, display_name: 'SafeTea Alerts', avatar_color: '#E8A0B5' },
          messages,
          is_system: true
        });
      }

      const otherUser = await getOne(
        'SELECT id, display_name, custom_display_name, avatar_color FROM users WHERE id = $1',
        [userId]
      );
      if (!otherUser) return res.status(404).json({ error: 'User not found' });

      const messages = await getMany(
        `SELECT id, sender_id, recipient_id, content, is_read, created_at
         FROM messages
         WHERE (sender_id = $1 AND recipient_id = $2)
            OR (sender_id = $2 AND recipient_id = $1)
         ORDER BY created_at ASC`,
        [user.id, userId]
      );

      // Mark unread messages as read
      await run(
        `UPDATE messages SET is_read = true
         WHERE sender_id = $1 AND recipient_id = $2 AND is_read = false`,
        [userId, user.id]
      );

      return res.status(200).json({ otherUser, messages });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load thread', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
