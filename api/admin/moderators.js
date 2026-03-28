const { requireAdmin, logAudit } = require('../_utils/adminAuth');
const { cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  // GET /api/admin/moderators — List all moderators with stats
  if (req.method === 'GET') {
    try {
      const moderators = await getMany(
        `SELECT u.id, u.email, u.display_name, u.custom_display_name, u.city,
                u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url,
                u.created_at, u.last_active,
                (SELECT COUNT(*) FROM audit_logs al WHERE al.actor_id = u.id) AS actions_taken,
                (SELECT COUNT(*) FROM audit_logs al WHERE al.actor_id = u.id AND al.action LIKE '%post%') AS posts_reviewed
         FROM users u
         WHERE u.role IN ('moderator', 'admin')
         ORDER BY u.role DESC, u.display_name ASC`
      );

      // Get city assignments for each moderator
      for (const mod of moderators) {
        const assignments = await getMany(
          'SELECT city, created_at FROM moderator_assignments WHERE user_id = $1',
          [mod.id]
        );
        mod.assigned_cities = assignments.map(a => a.city);
      }

      return res.status(200).json({ moderators });
    } catch (err) {
      console.error('Admin moderators list error:', err);
      return res.status(500).json({ error: 'Failed to fetch moderators' });
    }
  }

  // POST /api/admin/moderators — Assign city or promote/demote moderator
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { user_id, action } = body;

      if (!user_id) return res.status(400).json({ error: 'user_id required' });

      const target = await getOne('SELECT id, role, display_name FROM users WHERE id = $1', [user_id]);
      if (!target) return res.status(404).json({ error: 'User not found' });

      // Assign city
      if (action === 'assign_city') {
        const { city } = body;
        if (!city) return res.status(400).json({ error: 'city required' });

        // Ensure user is a moderator
        if (target.role !== 'moderator' && target.role !== 'admin') {
          return res.status(400).json({ error: 'User must be a moderator first' });
        }

        await run(
          `INSERT INTO moderator_assignments (user_id, city, assigned_by)
           VALUES ($1, $2, $3)
           ON CONFLICT (user_id, city) DO NOTHING`,
          [user_id, city, user.id]
        );
        await logAudit(user.id, user.role, 'assign_city', 'user', user_id, { city });
        return res.status(200).json({ message: `Assigned ${target.display_name} to ${city}` });
      }

      // Unassign city
      if (action === 'unassign_city') {
        const { city } = body;
        if (!city) return res.status(400).json({ error: 'city required' });

        await run(
          'DELETE FROM moderator_assignments WHERE user_id = $1 AND city = $2',
          [user_id, city]
        );
        await logAudit(user.id, user.role, 'unassign_city', 'user', user_id, { city });
        return res.status(200).json({ message: `Unassigned ${target.display_name} from ${city}` });
      }

      // Promote to moderator
      if (action === 'promote') {
        await run('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['moderator', user_id]);
        await logAudit(user.id, user.role, 'promote_to_mod', 'user', user_id, { old_role: target.role });
        return res.status(200).json({ message: `${target.display_name} promoted to moderator` });
      }

      // Demote to member
      if (action === 'demote') {
        await run('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', ['member', user_id]);
        await run('DELETE FROM moderator_assignments WHERE user_id = $1', [user_id]);
        await logAudit(user.id, user.role, 'demote_from_mod', 'user', user_id, { old_role: target.role });
        return res.status(200).json({ message: `${target.display_name} demoted to member` });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error('Admin moderator action error:', err);
      return res.status(500).json({ error: 'Failed to process moderator action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
