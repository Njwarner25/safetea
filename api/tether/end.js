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

    // Check membership
    const member = await getOne(
      `SELECT * FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session_id, String(user.id)]
    );
    if (!member) return res.status(403).json({ error: 'You are not a member of this session' });

    const session = await getOne(
      `SELECT * FROM tether_sessions WHERE id = $1 AND status IN ('pending', 'active')`,
      [session_id]
    );
    if (!session) return res.status(404).json({ error: 'Session not found or already ended' });

    if (member.role === 'host') {
      // Host ends entire session
      await run(
        `UPDATE tether_sessions SET status = 'ended', ended_at = NOW() WHERE id = $1`,
        [session_id]
      );
      await run(
        `UPDATE tether_members SET status = 'ended', removed_at = NOW() WHERE session_id = $1 AND status != 'ended'`,
        [session_id]
      );
      await run(
        `INSERT INTO tether_events (session_id, user_id, event_type)
         VALUES ($1, $2, 'session_ended')`,
        [session_id, String(user.id)]
      );

      return res.status(200).json({ success: true, action: 'session_ended' });
    } else {
      // Member leaves
      await run(
        `UPDATE tether_members SET status = 'ended', removed_at = NOW() WHERE id = $1`,
        [member.id]
      );
      await run(
        `INSERT INTO tether_events (session_id, user_id, event_type, metadata)
         VALUES ($1, $2, 'member_left', $3)`,
        [session_id, String(user.id), JSON.stringify({ display_name: member.display_name })]
      );

      return res.status(200).json({ success: true, action: 'member_left' });
    }
  } catch (err) {
    console.error('Tether end error:', err);
    return res.status(500).json({ error: 'Failed to end/leave session', details: err.message });
  }
};
