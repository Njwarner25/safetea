const { requireAdmin, logAudit } = require('../_utils/adminAuth');
const { cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await requireAdmin(req, res);
  if (!user) return;

  // GET /api/admin/users — List users with search/filter
  if (req.method === 'GET') {
    try {
      const {
        search, role, tier, city, banned, verified,
        sort = 'created_at', order = 'desc',
        page = 1, limit = 25
      } = req.query;

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (search) {
        conditions.push(`(u.display_name ILIKE $${paramIdx} OR u.email ILIKE $${paramIdx} OR u.custom_display_name ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }
      if (role) {
        conditions.push(`u.role = $${paramIdx}`);
        params.push(role);
        paramIdx++;
      }
      if (tier) {
        conditions.push(`u.subscription_tier = $${paramIdx}`);
        params.push(tier);
        paramIdx++;
      }
      if (city) {
        conditions.push(`u.city ILIKE $${paramIdx}`);
        params.push(`%${city}%`);
        paramIdx++;
      }
      if (banned === 'true') {
        conditions.push('u.banned = true');
      } else if (banned === 'false') {
        conditions.push('(u.banned = false OR u.banned IS NULL)');
      }
      if (verified === 'true') {
        conditions.push('u.is_verified = true');
      } else if (verified === 'false') {
        conditions.push('(u.is_verified = false OR u.is_verified IS NULL)');
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const allowedSorts = ['created_at', 'display_name', 'email', 'last_active', 'role'];
      const sortCol = allowedSorts.includes(sort) ? sort : 'created_at';
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

      // Count total
      const countResult = await getOne(
        `SELECT COUNT(*) as total FROM users u ${where}`,
        params
      );

      // Fetch page
      const users = await getMany(
        `SELECT u.id, u.email, u.display_name, u.custom_display_name, u.city, u.role,
                u.subscription_tier, u.created_at, u.last_active,
                u.is_verified, u.age_verified, u.identity_verified, u.gender_verified,
                u.banned, u.ban_reason, u.ban_type, u.ban_until,
                u.avatar_type, u.avatar_color, u.avatar_initial, u.avatar_url,
                u.warning_count,
                (SELECT COUNT(*) FROM posts p WHERE p.user_id = u.id) as post_count
         FROM users u
         ${where}
         ORDER BY u.${sortCol} ${sortOrder}
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), offset]
      );

      return res.status(200).json({
        users,
        pagination: {
          total: parseInt(countResult.total),
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(parseInt(countResult.total) / parseInt(limit))
        }
      });
    } catch (err) {
      console.error('Admin users list error:', err);
      return res.status(500).json({ error: 'Failed to fetch users' });
    }
  }

  // PUT /api/admin/users — Update user role/tier/suspend
  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { user_id, action } = body;

      if (!user_id) return res.status(400).json({ error: 'user_id required' });

      const target = await getOne('SELECT id, role, subscription_tier, banned FROM users WHERE id = $1', [user_id]);
      if (!target) return res.status(404).json({ error: 'User not found' });

      // Change role
      if (action === 'change_role') {
        const { role: newRole } = body;
        if (!['user', 'moderator', 'admin'].includes(newRole)) {
          return res.status(400).json({ error: 'Invalid role. Must be user, moderator, or admin' });
        }
        // Map 'user' to 'member' internally since DB uses 'member'
        const dbRole = newRole === 'user' ? 'member' : newRole;
        await run('UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2', [dbRole, user_id]);
        await logAudit(user.id, user.role, 'change_role', 'user', user_id, { old_role: target.role, new_role: dbRole });
        return res.status(200).json({ message: `Role updated to ${newRole}`, user_id });
      }

      // Change tier
      if (action === 'change_tier') {
        const { tier } = body;
        if (!['free', 'plus', 'pro'].includes(tier)) {
          return res.status(400).json({ error: 'Invalid tier. Must be free, plus, or pro' });
        }
        await run('UPDATE users SET subscription_tier = $1, updated_at = NOW() WHERE id = $2', [tier, user_id]);
        await logAudit(user.id, user.role, 'change_tier', 'user', user_id, { old_tier: target.subscription_tier, new_tier: tier });
        return res.status(200).json({ message: `Tier updated to ${tier}`, user_id });
      }

      // Suspend account
      if (action === 'suspend') {
        const { reason, duration_days } = body;
        if (!reason || reason.trim().length < 10) {
          return res.status(400).json({ error: 'Reason must be at least 10 characters' });
        }
        if (String(user_id) === String(user.id)) {
          return res.status(400).json({ error: 'Cannot suspend yourself' });
        }
        if (target.role === 'admin') {
          return res.status(403).json({ error: 'Cannot suspend other admins' });
        }

        let banUntil = null;
        if (duration_days) {
          banUntil = new Date();
          banUntil.setDate(banUntil.getDate() + parseInt(duration_days));
        }

        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1,
           ban_type = $2, ban_until = $3, updated_at = NOW() WHERE id = $4`,
          [reason, duration_days ? 'temporary' : 'permanent', banUntil, user_id]
        );
        await run('UPDATE posts SET hidden = true WHERE user_id = $1', [user_id]);
        await logAudit(user.id, user.role, 'suspend_user', 'user', user_id, { reason, duration_days });
        return res.status(200).json({ message: 'User suspended', user_id });
      }

      // Unsuspend
      if (action === 'unsuspend') {
        await run(
          'UPDATE users SET banned = false, ban_reason = NULL, ban_type = NULL, ban_until = NULL, updated_at = NOW() WHERE id = $1',
          [user_id]
        );
        await run('UPDATE posts SET hidden = false WHERE user_id = $1', [user_id]);
        await logAudit(user.id, user.role, 'unsuspend_user', 'user', user_id, {});
        return res.status(200).json({ message: 'User unsuspended', user_id });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error('Admin user update error:', err);
      return res.status(500).json({ error: 'Failed to update user' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
