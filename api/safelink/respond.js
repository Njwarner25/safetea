const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

// POST /api/safelink/respond — host accepts or declines an incoming connection request.
// Body: { requestId, action: 'accept' | 'decline' }
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const requestId = parseInt(body.requestId, 10);
  const action = (body.action || '').toString().toLowerCase();
  if (!requestId || !['accept', 'decline'].includes(action)) {
    return res.status(400).json({ error: 'requestId and action (accept|decline) required' });
  }

  try {
    const reqRow = await getOne(
      `SELECT c.id, c.session_id, c.host_user_id, c.requester_user_id, c.status, s.status AS session_status
       FROM safelink_connections c
       JOIN safelink_sessions s ON s.id = c.session_id
       WHERE c.id = $1`,
      [requestId]
    );

    if (!reqRow) return res.status(404).json({ error: 'Request not found' });
    if (reqRow.host_user_id !== user.id) return res.status(403).json({ error: 'Not your request to answer' });
    if (reqRow.status !== 'pending') return res.status(409).json({ error: `Request already ${reqRow.status}` });
    if (reqRow.session_status !== 'active') return res.status(410).json({ error: 'Session ended' });

    const newStatus = action === 'accept' ? 'accepted' : 'declined';
    await run(
      `UPDATE safelink_connections SET status = $1, responded_at = NOW() WHERE id = $2`,
      [newStatus, requestId]
    );

    return res.status(200).json({ success: true, requestId, status: newStatus });
  } catch (err) {
    console.error('SafeLink respond error:', err);
    return res.status(500).json({ error: 'Failed to respond', details: err.message });
  }
};
