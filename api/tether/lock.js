const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = await parseBody(req);
    const { session_id } = body;

    if (!session_id) return res.status(400).json({ error: 'session_id is required' });

    // Verify host
    const session = await getOne(
      `SELECT * FROM tether_sessions WHERE id = $1 AND host_user_id = $2`,
      [session_id, String(user.id)]
    );
    if (!session) return res.status(403).json({ error: 'Only the host can lock this session' });

    if (session.status !== 'pending') {
      return res.status(400).json({ error: 'Session can only be locked from pending status' });
    }

    // Lock session — set to active
    await run(
      `UPDATE tether_sessions SET status = 'active', locked_at = NOW() WHERE id = $1`,
      [session_id]
    );

    // Log event
    await run(
      `INSERT INTO tether_events (session_id, user_id, event_type)
       VALUES ($1, $2, 'session_locked')`,
      [session_id, String(user.id)]
    );

    return res.status(200).json({ success: true, status: 'active' });
  } catch (err) {
    console.error('Tether lock error:', err);
    return res.status(500).json({ error: 'Failed to lock Tether session', details: err.message });
  }
};
