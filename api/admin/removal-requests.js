const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url, 'http://x');
      const status = url.searchParams.get('status');

      let query = `SELECT r.id, r.requester_id, r.post_id, r.reason, r.details, r.status, r.reporter_email,
                     r.leaked_image_hash, r.watermark_user_id, r.auto_action_taken, r.reviewed_by, r.reviewed_at, r.created_at,
                     u.display_name AS watermark_user_name, u.email AS watermark_user_email, u.banned AS watermark_user_banned
                   FROM removal_requests r
                   LEFT JOIN users u ON r.watermark_user_id = u.id`;
      const params = [];

      if (status) {
        query += ' WHERE r.status = $1';
        params.push(status);
      }

      query += ' ORDER BY r.created_at DESC LIMIT 100';

      const requests = await getMany(query, params);
      return res.json({ requests });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const { id, status, action } = body;

      if (!id) return res.status(400).json({ error: 'id is required' });

      // Action: ban watermarked user and hide all their posts
      if (action === 'ban_and_remove') {
        const request = await getOne('SELECT * FROM removal_requests WHERE id = $1', [id]);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (!request.watermark_user_id) return res.status(400).json({ error: 'No watermark user associated with this request' });

        const targetId = request.watermark_user_id;

        // Ban user
        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent' WHERE id = $2 AND banned = false`,
          ['Photo leaked outside SafeTea (admin action from removal request #' + id + ')', targetId]
        );

        // Hide all their posts
        const hidden = await run('UPDATE posts SET hidden = true WHERE user_id = $1 AND hidden = false', [targetId]);

        // Mark request resolved
        await run(
          `UPDATE removal_requests SET status = 'resolved', auto_action_taken = 'admin_banned_posts_hidden', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
          [user.id, id]
        );

        return res.json({ success: true, action: 'ban_and_remove', user_id: targetId, posts_hidden: true });
      }

      // Action: hide posts by watermarked user only (no ban)
      if (action === 'remove_posts') {
        const request = await getOne('SELECT * FROM removal_requests WHERE id = $1', [id]);
        if (!request) return res.status(404).json({ error: 'Request not found' });
        if (!request.watermark_user_id) return res.status(400).json({ error: 'No watermark user associated with this request' });

        await run('UPDATE posts SET hidden = true WHERE user_id = $1 AND hidden = false', [request.watermark_user_id]);
        await run(
          `UPDATE removal_requests SET status = 'resolved', auto_action_taken = 'admin_posts_hidden', reviewed_by = $1, reviewed_at = NOW() WHERE id = $2`,
          [user.id, id]
        );

        return res.json({ success: true, action: 'remove_posts', user_id: request.watermark_user_id });
      }

      // Default: update status
      const validStatuses = ['pending', 'manual_review', 'resolved', 'auto_resolved'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
      }

      const result = await getOne(
        `UPDATE removal_requests SET status = $1, reviewed_by = $2, reviewed_at = NOW() WHERE id = $3 RETURNING *`,
        [status, user.id, id]
      );

      if (!result) return res.status(404).json({ error: 'Request not found' });

      return res.json({ success: true, request: result });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('Admin removal requests error:', err);
    return res.status(500).json({ error: 'Failed to load removal requests: ' + err.message });
  }
};
