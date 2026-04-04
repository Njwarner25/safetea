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

      let query = `SELECT id, requester_id, post_id, reason, details, status, reporter_email,
                     leaked_image_hash, watermark_user_id, auto_action_taken, reviewed_by, reviewed_at, created_at
                   FROM removal_requests`;
      const params = [];

      if (status) {
        query += ' WHERE status = $1';
        params.push(status);
      }

      query += ' ORDER BY created_at DESC LIMIT 100';

      const requests = await getMany(query, params);
      return res.json({ requests });
    }

    if (req.method === 'PUT') {
      const body = await parseBody(req);
      const { id, status } = body;

      if (!id) return res.status(400).json({ error: 'id is required' });

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
