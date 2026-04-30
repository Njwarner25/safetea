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
    const { session_id, target_user_id } = body;

    if (!session_id || !target_user_id) {
      return res.status(400).json({ error: 'session_id and target_user_id are required' });
    }

    // Verify sender is in session
    const sender = await getOne(
      `SELECT id FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session_id, String(user.id)]
    );
    if (!sender) return res.status(403).json({ error: 'You are not a member of this session' });

    // Verify target is in session
    const target = await getOne(
      `SELECT id, display_name FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session_id, String(target_user_id)]
    );
    if (!target) return res.status(404).json({ error: 'Target user not found in this session' });

    // Verify session is active
    const session = await getOne(
      `SELECT id FROM tether_sessions WHERE id = $1 AND status = 'active'`,
      [session_id]
    );
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    // Update target's last_ping_at
    await run(
      `UPDATE tether_members SET last_ping_at = NOW() WHERE id = $1`,
      [target.id]
    );

    // Log event
    await run(
      `INSERT INTO tether_events (session_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'ping', $3)`,
      [session_id, String(user.id), JSON.stringify({ target_user_id: String(target_user_id), target_name: target.display_name })]
    );

    return res.status(200).json({ success: true, pinged: target_user_id });
  } catch (err) {
    console.error('Tether ping error:', err);
    return res.status(500).json({ error: 'Failed to send ping', details: err.message });
  }
};
