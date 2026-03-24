const { getOne, run, getMany } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const admin = await authenticate(req);
    if (!admin) return res.status(401).json({ error: 'Not authenticated' });

    // Only admins can ban users
    if (admin.role !== 'admin') {
      return res.status(403).json({ error: 'Only administrators can ban users' });
    }

    const { user_id, reason, ban_type, duration_days } = req.body || {};

    if (!user_id) return res.status(400).json({ error: 'User ID is required' });
    if (!reason) return res.status(400).json({ error: 'Ban reason is required' });

    // Can't ban yourself
    if (user_id === admin.id) {
      return res.status(400).json({ error: 'You cannot ban yourself' });
    }

    // Verify user exists
    const targetUser = await getOne('SELECT id, role, display_name, banned FROM users WHERE id = $1', [user_id]);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Can't ban other admins
    if (targetUser.role === 'admin') {
      return res.status(403).json({ error: 'Cannot ban another admin' });
    }

    const validBanTypes = ['temporary', 'permanent'];
    const type = ban_type && validBanTypes.includes(ban_type) ? ban_type : 'permanent';
    const banUntil = type === 'temporary' && duration_days
      ? new Date(Date.now() + duration_days * 24 * 60 * 60 * 1000).toISOString()
      : null;

    // Ban the user
    await run(
      'UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = $2, ban_until = $3 WHERE id = $4',
      [reason, type, banUntil, user_id]
    );

    // Hide all their posts
    await run('UPDATE posts SET hidden = true WHERE user_id = $1', [user_id]);

    // Count affected posts
    const postCount = await getOne('SELECT COUNT(*) as count FROM posts WHERE user_id = $1', [user_id]);

    // Insert ban log
    await run(
      'INSERT INTO ban_log (admin_id, banned_user_id, reason, ban_type, ban_until) VALUES ($1, $2, $3, $4, $5)',
      [admin.id, user_id, reason, type, banUntil]
    );

    console.log(`[BAN] Admin ${admin.id} banned user ${user_id} (${type}): ${reason}`);

    return res.status(200).json({
      status: 'banned',
      message: `User ${targetUser.display_name} has been ${type === 'temporary' ? 'temporarily' : 'permanently'} banned`,
      ban_type: type,
      ban_until: banUntil,
      posts_hidden: parseInt(postCount.count)
    });
  } catch (error) {
    console.error('Ban user error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
