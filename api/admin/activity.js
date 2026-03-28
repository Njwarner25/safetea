const { requireAdmin } = require('../_utils/adminAuth');
const { cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { user_id, page = 1, limit = 50 } = req.query;
    const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

    // If user_id provided, show that user's activity; otherwise show all audit logs
    if (user_id) {
      // User activity: posts, replies, reports filed, warnings received
      const posts = await getMany(
        `SELECT 'post' as type, p.id, p.title as description, p.created_at
         FROM posts p WHERE p.user_id = $1
         ORDER BY p.created_at DESC LIMIT 50`,
        [user_id]
      );

      const replies = await getMany(
        `SELECT 'reply' as type, r.id, SUBSTRING(r.body, 1, 100) as description, r.created_at
         FROM replies r WHERE r.user_id = $1
         ORDER BY r.created_at DESC LIMIT 50`,
        [user_id]
      );

      const warnings = await getMany(
        `SELECT 'warning' as type, w.id, w.reason as description, w.created_at
         FROM user_warnings w WHERE w.user_id = $1
         ORDER BY w.created_at DESC`,
        [user_id]
      );

      const reportsBy = await getMany(
        `SELECT 'report_filed' as type, r.id, r.reason as description, r.created_at
         FROM reports r WHERE r.reporter_id = $1
         ORDER BY r.created_at DESC LIMIT 50`,
        [user_id]
      );

      const reportsAgainst = await getMany(
        `SELECT 'report_received' as type, r.id, r.reason as description, r.created_at
         FROM reports r WHERE r.reported_user_id = $1
         ORDER BY r.created_at DESC LIMIT 50`,
        [user_id]
      );

      // Merge and sort by date
      const activity = [...posts, ...replies, ...warnings, ...reportsBy, ...reportsAgainst]
        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
        .slice(offset, offset + parseInt(limit));

      return res.status(200).json({ activity, user_id });
    }

    // Global audit log
    const logs = await getMany(
      `SELECT al.id, al.action, al.target_type, al.target_id, al.details, al.created_at,
              u.display_name AS actor_name, u.custom_display_name AS actor_custom_name, al.actor_role
       FROM audit_logs al
       LEFT JOIN users u ON u.id = al.actor_id
       ORDER BY al.created_at DESC
       LIMIT $1 OFFSET $2`,
      [parseInt(limit), offset]
    );

    return res.status(200).json({ logs });
  } catch (err) {
    console.error('Admin activity error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity' });
  }
};
