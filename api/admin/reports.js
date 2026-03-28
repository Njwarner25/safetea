const { requireMod, logAudit } = require('../_utils/adminAuth');
const { cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Both admins and moderators can access reports
  const user = await requireMod(req, res);
  if (!user) return;

  // GET /api/admin/reports — List reports
  if (req.method === 'GET') {
    try {
      const {
        status = 'pending',
        page = 1, limit = 25
      } = req.query;

      const offset = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);
      const conditions = [];
      const params = [];
      let paramIdx = 1;

      if (status && status !== 'all') {
        conditions.push(`r.status = $${paramIdx}`);
        params.push(status);
        paramIdx++;
      }

      // If moderator, filter by their assigned cities
      if (user.role === 'moderator') {
        const assignments = await getMany(
          'SELECT city FROM moderator_assignments WHERE user_id = $1',
          [user.id]
        );
        if (assignments.length > 0) {
          // Filter reports: post city matches or reported user city matches
          const cities = assignments.map((a, i) => `$${paramIdx + i}`);
          conditions.push(
            `(p.city IN (${cities.join(',')}) OR reported_u.city IN (${cities.join(',')}))`
          );
          assignments.forEach(a => { params.push(a.city); paramIdx++; });
        } else {
          return res.status(200).json({ reports: [], pagination: { total: 0, page: 1, limit: 25, pages: 0 } });
        }
      }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const countResult = await getOne(
        `SELECT COUNT(*) as total
         FROM reports r
         LEFT JOIN posts p ON p.id = r.reported_post_id
         LEFT JOIN users reported_u ON reported_u.id = r.reported_user_id
         ${where}`,
        params
      );

      const reports = await getMany(
        `SELECT r.id, r.reason, r.details, r.status, r.created_at,
                r.resolved_at, r.resolution_note,
                reporter.id AS reporter_id, reporter.display_name AS reporter_name,
                reporter.custom_display_name AS reporter_custom_name,
                reported_u.id AS reported_user_id, reported_u.display_name AS reported_user_name,
                reported_u.custom_display_name AS reported_user_custom_name,
                p.id AS post_id, p.title AS post_title, p.body AS post_body, p.city AS post_city,
                resolver.display_name AS resolved_by_name
         FROM reports r
         LEFT JOIN users reporter ON reporter.id = r.reporter_id
         LEFT JOIN users reported_u ON reported_u.id = r.reported_user_id
         LEFT JOIN posts p ON p.id = r.reported_post_id
         LEFT JOIN users resolver ON resolver.id = r.resolved_by
         ${where}
         ORDER BY r.created_at DESC
         LIMIT $${paramIdx} OFFSET $${paramIdx + 1}`,
        [...params, parseInt(limit), offset]
      );

      return res.status(200).json({
        reports,
        pagination: {
          total: parseInt(countResult.total),
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(parseInt(countResult.total) / parseInt(limit))
        }
      });
    } catch (err) {
      console.error('Admin reports list error:', err);
      return res.status(500).json({ error: 'Failed to fetch reports' });
    }
  }

  // PUT /api/admin/reports — Take action on a report
  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { report_id, action } = body;

      if (!report_id) return res.status(400).json({ error: 'report_id required' });

      const report = await getOne('SELECT * FROM reports WHERE id = $1', [report_id]);
      if (!report) return res.status(404).json({ error: 'Report not found' });

      if (action === 'dismiss') {
        await run(
          `UPDATE reports SET status = 'dismissed', resolved_by = $1, resolved_at = NOW(),
           resolution_note = $2 WHERE id = $3`,
          [user.id, body.note || 'Dismissed', report_id]
        );
        await logAudit(user.id, user.role, 'dismiss_report', 'report', report_id, {});
        return res.status(200).json({ message: 'Report dismissed' });
      }

      if (action === 'remove_content') {
        if (report.reported_post_id) {
          await run(
            "UPDATE posts SET moderation_status = 'removed', hidden = true, moderated_by = $1, moderated_at = NOW() WHERE id = $2",
            [user.id, report.reported_post_id]
          );
        }
        await run(
          `UPDATE reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(),
           resolution_note = $2 WHERE id = $3`,
          [user.id, body.note || 'Content removed', report_id]
        );
        await logAudit(user.id, user.role, 'remove_reported_content', 'report', report_id, { post_id: report.reported_post_id });
        return res.status(200).json({ message: 'Content removed and report resolved' });
      }

      if (action === 'warn_user') {
        const targetUserId = report.reported_user_id;
        if (!targetUserId) return res.status(400).json({ error: 'No reported user on this report' });

        await run(
          'INSERT INTO user_warnings (user_id, issued_by, reason, post_id) VALUES ($1, $2, $3, $4)',
          [targetUserId, user.id, body.reason || report.reason, report.reported_post_id]
        );
        await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1 WHERE id = $1', [targetUserId]);
        await run(
          `UPDATE reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(),
           resolution_note = $2 WHERE id = $3`,
          [user.id, body.note || 'User warned', report_id]
        );
        await logAudit(user.id, user.role, 'warn_reported_user', 'report', report_id, { warned_user_id: targetUserId });
        return res.status(200).json({ message: 'User warned and report resolved' });
      }

      if (action === 'suspend_user') {
        // Only admins can suspend
        if (user.role !== 'admin') {
          return res.status(403).json({ error: 'Only admins can suspend users' });
        }
        const targetUserId = report.reported_user_id;
        if (!targetUserId) return res.status(400).json({ error: 'No reported user on this report' });

        const { reason, duration_days } = body;
        let banUntil = null;
        if (duration_days) {
          banUntil = new Date();
          banUntil.setDate(banUntil.getDate() + parseInt(duration_days));
        }
        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1,
           ban_type = $2, ban_until = $3 WHERE id = $4`,
          [reason || report.reason, duration_days ? 'temporary' : 'permanent', banUntil, targetUserId]
        );
        await run('UPDATE posts SET hidden = true WHERE user_id = $1', [targetUserId]);
        await run(
          `UPDATE reports SET status = 'resolved', resolved_by = $1, resolved_at = NOW(),
           resolution_note = $2 WHERE id = $3`,
          [user.id, body.note || 'User suspended', report_id]
        );
        await logAudit(user.id, user.role, 'suspend_reported_user', 'report', report_id, { suspended_user_id: targetUserId });
        return res.status(200).json({ message: 'User suspended and report resolved' });
      }

      return res.status(400).json({ error: 'Invalid action. Use: dismiss, remove_content, warn_user, suspend_user' });
    } catch (err) {
      console.error('Admin report action error:', err);
      return res.status(500).json({ error: 'Failed to process report action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
