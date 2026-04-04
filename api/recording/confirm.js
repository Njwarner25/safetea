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
  const chunkNumber = body.chunkNumber !== undefined ? body.chunkNumber : body.segmentNumber;

  if (!sessionKey || chunkNumber === undefined) {
    return res.status(400).json({ error: 'Missing required fields: sessionKey, chunkNumber' });
  }

  try {
    const chunk = await getOne(
      `SELECT id FROM recording_chunks WHERE session_key = $1 AND chunk_number = $2`,
      [sessionKey, chunkNumber]
    );

    if (!chunk) {
      return res.status(404).json({ error: 'Chunk not found' });
    }

    return res.status(200).json({ confirmed: true, chunkNumber });
  } catch (err) {
    console.error('Recording confirm error:', err);
    return res.status(500).json({ error: 'Failed to confirm chunk', details: err.message });
  }
};
