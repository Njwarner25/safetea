const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    const body = await parseBody(req);
    const { user_id, reason } = body;

    if (!user_id) return res.status(400).json({ error: 'user_id is required' });
    if (!reason || reason.trim().length < 10) {
      return res.status(400).json({ error: 'Reason must be at least 10 characters' });
    }

    const target = await getOne('SELECT id, role FROM users WHERE id = $1', [user_id]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    // Increment warning count
    await run(
      `UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1`,
      [user_id]
    );

    // Send warning to user's inbox
    await run(
      `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at)
       VALUES ($1, $1, $2, true, NOW())`,
      [user_id, `⚠️ Warning from SafeTea Moderation\n\nReason: ${reason.trim()}\n\nPlease review the community guidelines. Repeated violations may result in account suspension.`]
    );

    return res.status(200).json({ message: 'Warning sent successfully', user_id });
  } catch (err) {
    console.error('Warn user error:', err);
    return res.status(500).json({ error: 'Failed to send warning' });
  }
};
