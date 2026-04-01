const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey, chunkNumber, audioData, durationMs, latitude, longitude } = body;

  if (!sessionKey || chunkNumber === undefined || !audioData) {
    return res.status(400).json({ error: 'Missing required fields: sessionKey, chunkNumber, audioData' });
  }

  try {
    // Verify session belongs to user and is active
    const session = await getOne(
      `SELECT * FROM recording_sessions WHERE session_key = $1 AND user_id = $2 AND status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording session not found' });
    }

    // Insert chunk
    await run(
      `INSERT INTO recording_chunks (session_key, chunk_number, audio_data, duration_ms)
       VALUES ($1, $2, $3, $4)`,
      [sessionKey, chunkNumber, audioData, durationMs || null]
    );

    // Update GPS if provided
    if (latitude && longitude) {
      await run(
        `UPDATE recording_sessions SET latitude = $1, longitude = $2 WHERE session_key = $3`,
        [latitude, longitude, sessionKey]
      );
    }

    return res.status(200).json({ success: true, chunkNumber });
  } catch (err) {
    console.error('Recording chunk error:', err);
    return res.status(500).json({ error: 'Failed to save chunk', details: err.message });
  }
};
