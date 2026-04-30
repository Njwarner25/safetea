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
    const { session_id, response } = body;

    if (!session_id || !response) {
      return res.status(400).json({ error: 'session_id and response are required' });
    }

    const validResponses = ['okay', 'heading_back', 'need_help'];
    if (!validResponses.includes(response)) {
      return res.status(400).json({ error: 'response must be one of: okay, heading_back, need_help' });
    }

    // Verify membership
    const member = await getOne(
      `SELECT * FROM tether_members WHERE session_id = $1 AND user_id = $2 AND status != 'ended'`,
      [session_id, String(user.id)]
    );
    if (!member) return res.status(403).json({ error: 'You are not a member of this session' });

    // Verify session is active
    const session = await getOne(
      `SELECT id FROM tether_sessions WHERE id = $1 AND status = 'active'`,
      [session_id]
    );
    if (!session) return res.status(404).json({ error: 'Active session not found' });

    // Update last_response
    await run(
      `UPDATE tether_members SET last_response = $1 WHERE id = $2`,
      [response, member.id]
    );

    // Log event
    const eventType = response === 'need_help' ? 'member_needs_help' : 'member_okay';
    await run(
      `INSERT INTO tether_events (session_id, user_id, event_type, metadata)
       VALUES ($1, $2, $3, $4)`,
      [session_id, String(user.id), eventType, JSON.stringify({ response })]
    );

    return res.status(200).json({ success: true, response });
  } catch (err) {
    console.error('Tether respond error:', err);
    return res.status(500).json({ error: 'Failed to record response', details: err.message });
  }
};
