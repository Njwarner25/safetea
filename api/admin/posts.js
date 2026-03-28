const { requireAdmin, requireMod, logAudit } = require('../_utils/adminAuth');
const { cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Both admins and moderators can access content moderation
  const { requireMod: reqMod } = require('../_utils/adminAuth');
  const user = await reqMod(req, res);
  if (!user) return;

  // GET /api/admin/posts — List posts with moderation filters
  if (req.method === 'GET') {
    try {
      const {
        status, city, feed, search,
        sort = 'created_at', order = 'desc',
        page = 1, limit = 25
      } = req.query;

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      // If moderator, filter by assigned cities
      if (user.role === 'moderator') {
        const assignments = await getMany(
          'SELECT city FROM moderator_assignments WHERE user_id = $1',
          [user.id]
        );
        if (assignments.length > 0) {
          const cities = assignments.map((a, i) => `$${paramIdx + i}`);
          conditions.push(`p.city IN (${cities.join(',')})`);
          assignments.forEach(a => { params.push(a.city); paramIdx++; });
        } else {
          // Moderator with no city assignments sees nothing
          return res.status(200).json({ posts: [], pagination: { total: 0, page: 1, limit: 25, pages: 0 } });
        }
      }

      if (status && status !== 'all') {
        if (status === 'reported') {
          conditions.push('p.report_count > 0');
        } else {
          conditions.push(`p.moderation_status = $${paramIdx}`);
          params.push(status);
          paramIdx++;
        }
      }
      if (city && user.role === 'admin') {
        conditions.push(`p.city ILIKE $${paramIdx}`);
        params.push(`%${city}%`);
        paramIdx++;
      }
      if (feed) {
        conditions.push(`p.feed = $${paramIdx}`);
        params.push(feed);
        paramIdx++;
      }
      if (search) {
        conditions.push(`(p.title ILIKE $${paramIdx} OR p.body ILIKE $${paramIdx})`);
        params.push(`%${search}%`);
        paramIdx++;
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
      const sortOrder = order === 'asc' ? 'ASC' : 'DESC';

      const countResult = await getOne(
        `SELECT COUNT(*) as total FROM posts p ${where}`,
        params
      );

      const posts = await getMany(
        `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                p.feed, p.likes, p.image_url, p.created_at,
                p.moderation_status, p.moderated_by, p.moderated_at,
                p.report_count, p.hidden,
                u.display_name AS author_name, u.custom_display_name AS author_custom_name,
                u.email AS author_email, u.role AS author_role,
                (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         ${where}
         ORDER BY p.report_count DESC, p.created_at ${sortOrder}
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), offset]
      );

      return res.status(200).json({
        posts,
        pagination: {
          total: parseInt(countResult.total),
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(parseInt(countResult.total) / parseInt(limit))
        }
      });
    } catch (err) {
      console.error('Admin posts list error:', err);
      return res.status(500).json({ error: 'Failed to fetch posts' });
    }
  }

  // PUT /api/admin/posts — Moderate a post
  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { post_id, action } = body;

      if (!post_id) return res.status(400).json({ error: 'post_id required' });

      const post = await getOne('SELECT id, user_id, moderation_status, city FROM posts WHERE id = $1', [post_id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // Moderators can only act on posts in their assigned cities
      if (user.role === 'moderator') {
        const assignment = await getOne(
          'SELECT id FROM moderator_assignments WHERE user_id = $1 AND city = $2',
          [user.id, post.city]
        );
        if (!assignment) {
          return res.status(403).json({ error: 'Not assigned to this city' });
        }
      }

      const validActions = ['approve', 'remove', 'flag', 'warn_user', 'ban_user'];
      if (!validActions.includes(action)) {
        return res.status(400).json({ error: 'Invalid action' });
      }

      if (action === 'approve') {
        await run(
          'UPDATE posts SET moderation_status = $1, moderated_by = $2, moderated_at = NOW(), hidden = false WHERE id = $3',
          ['approved', user.id, post_id]
        );
        await logAudit(user.id, user.role, 'approve_post', 'post', post_id, {});
      }

      if (action === 'remove') {
        await run(
          'UPDATE posts SET moderation_status = $1, moderated_by = $2, moderated_at = NOW(), hidden = true WHERE id = $3',
          ['removed', user.id, post_id]
        );
        await logAudit(user.id, user.role, 'remove_post', 'post', post_id, {});
      }

      if (action === 'flag') {
        await run(
          'UPDATE posts SET moderation_status = $1, moderated_by = $2, moderated_at = NOW() WHERE id = $3',
          ['flagged', user.id, post_id]
        );
        await logAudit(user.id, user.role, 'flag_post', 'post', post_id, {});
      }

      if (action === 'warn_user') {
        const { reason } = body;
        if (!reason) return res.status(400).json({ error: 'reason required for warning' });
        await run(
          'INSERT INTO user_warnings (user_id, issued_by, reason, post_id) VALUES ($1, $2, $3, $4)',
          [post.user_id, user.id, reason, post_id]
        );
        await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1 WHERE id = $1', [post.user_id]);
        await logAudit(user.id, user.role, 'warn_user', 'user', post.user_id, { reason, post_id });
      }

      if (action === 'ban_user') {
        const { reason, duration_days } = body;
        if (!reason) return res.status(400).json({ error: 'reason required for ban' });
        // Only admins can ban
        if (user.role !== 'admin') {
          return res.status(403).json({ error: 'Only admins can ban users' });
        }
        let banUntil = null;
        if (duration_days) {
          banUntil = new Date();
          banUntil.setDate(banUntil.getDate() + parseInt(duration_days));
        }
        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1,
           ban_type = $2, ban_until = $3 WHERE id = $4`,
          [reason, duration_days ? 'temporary' : 'permanent', banUntil, post.user_id]
        );
        await run('UPDATE posts SET hidden = true WHERE user_id = $1', [post.user_id]);
        await logAudit(user.id, user.role, 'ban_user_from_post', 'user', post.user_id, { reason, post_id, duration_days });
      }

      return res.status(200).json({ message: `Post ${action} successful`, post_id });
    } catch (err) {
      console.error('Admin post moderate error:', err);
      return res.status(500).json({ error: 'Failed to moderate post' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
