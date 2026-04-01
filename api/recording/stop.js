const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey } = body;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Missing sessionKey' });
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
      `UPDATE recording_sessions SET status = 'stopped', stopped_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    // Count total chunks
    const chunkCount = await getOne(
      `SELECT COUNT(*) as total FROM recording_chunks WHERE session_key = $1`,
      [sessionKey]
    );

    return res.status(200).json({
      success: true,
      sessionKey,
      totalChunks: parseInt(chunkCount.total, 10),
      stoppedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Recording stop error:', err);
    return res.status(500).json({ error: 'Failed to stop recording', details: err.message });
  }
};
