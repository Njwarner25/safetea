const { cors } = require('../_utils/auth');
const { getOne, getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { key } = req.query || {};
  if (!key) {
    return res.status(400).json({ error: 'Session key required' });
  }

  try {
    const session = await getOne(
      `SELECT rs.*, u.display_name, u.custom_display_name
       FROM recording_sessions rs
       JOIN users u ON rs.user_id = u.id
       WHERE rs.session_key = $1`,
      [key]
    );

    if (!session) {
      return res.status(404).json({ error: 'Recording session not found' });
    }

    // Get all chunks for this session
    const chunks = await getMany(
      `SELECT chunk_number, audio_data, duration_ms, created_at
       FROM recording_chunks
       WHERE session_key = $1
       ORDER BY chunk_number ASC`,
      [key]
    );

    const displayName = session.custom_display_name || session.display_name || 'A SafeTea user';

    return res.status(200).json({
      success: true,
      session: {
        status: session.status,
        userName: displayName,
        latitude: session.latitude,
        longitude: session.longitude,
        contactsNotified: session.contacts_notified,
        escalatedAt: session.escalated_at,
        stoppedAt: session.stopped_at,
        createdAt: session.created_at,
        transcript: session.transcript || null,
      },
      chunks: chunks.map(function(c) {
        return {
          chunkNumber: c.chunk_number,
          audioData: c.audio_data,
          durationMs: c.duration_ms,
          createdAt: c.created_at,
        };
      }),
    });
  } catch (err) {
    console.error('Recording session error:', err);
    return res.status(500).json({ error: 'Failed to fetch recording session' });
  }
};
