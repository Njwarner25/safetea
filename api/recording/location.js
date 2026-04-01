const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey, latitude, longitude } = body;

  if (!sessionKey || !latitude || !longitude) {
    return res.status(400).json({ error: 'Missing sessionKey, latitude, or longitude' });
  }

  try {
    const session = await getOne(
      `SELECT * FROM recording_sessions WHERE session_key = $1 AND user_id = $2 AND status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording session not found' });
    }

    await run(
      `UPDATE recording_sessions SET latitude = $1, longitude = $2 WHERE session_key = $3`,
      [latitude, longitude, sessionKey]
    );

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Recording location update error:', err);
    return res.status(500).json({ error: 'Failed to update location' });
  }
};
