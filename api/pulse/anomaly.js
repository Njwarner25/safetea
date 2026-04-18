const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS pulse_anomalies (
    id SERIAL PRIMARY KEY,
    session_key VARCHAR(64) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(40) NOT NULL,
    latitude DECIMAL(10,8),
    longitude DECIMAL(11,8),
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await ensureSchema();
    const body = await parseBody(req);
    const { sessionKey, anomalyType, location, metadata } = body || {};
    if (!sessionKey || !anomalyType) {
      return res.status(400).json({ error: 'sessionKey and anomalyType required' });
    }

    const row = await getOne(
      `INSERT INTO pulse_anomalies
        (session_key, user_id, anomaly_type, latitude, longitude, metadata)
       VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
      [
        sessionKey,
        user.id,
        anomalyType,
        location?.latitude ?? null,
        location?.longitude ?? null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return res.status(200).json({ anomaly: row });
  } catch (err) {
    console.error('[pulse/anomaly]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
