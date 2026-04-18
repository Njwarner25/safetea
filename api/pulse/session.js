const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');
const crypto = require('crypto');

async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS pulse_sessions (
    id SERIAL PRIMARY KEY,
    session_key VARCHAR(64) UNIQUE NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    session_type VARCHAR(20) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    trusted_contact_id VARCHAR(100),
    destination_lat DECIMAL(10,8),
    destination_lon DECIMAL(11,8),
    destination_label TEXT,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expected_end_at TIMESTAMPTZ,
    last_movement_at TIMESTAMPTZ,
    last_known_lat DECIMAL(10,8),
    last_known_lon DECIMAL(11,8),
    last_prompt_at TIMESTAMPTZ,
    anomaly_type VARCHAR(40),
    escalation_status VARCHAR(20) DEFAULT 'idle',
    pulse_enabled BOOLEAN DEFAULT TRUE,
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await ensureSchema();

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const {
        sessionType = 'custom',
        trustedContactId,
        destination,
        expectedEndAt,
        pulseEnabled = true,
      } = body || {};

      const sessionKey = crypto.randomBytes(24).toString('hex');
      const session = await getOne(
        `INSERT INTO pulse_sessions
          (session_key, user_id, session_type, trusted_contact_id,
           destination_lat, destination_lon, destination_label,
           expected_end_at, last_movement_at, pulse_enabled)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),$9)
         RETURNING *`,
        [
          sessionKey,
          user.id,
          sessionType,
          trustedContactId || null,
          destination?.latitude ?? null,
          destination?.longitude ?? null,
          destination?.label ?? null,
          expectedEndAt || null,
          !!pulseEnabled,
        ]
      );
      return res.status(200).json({ session });
    }

    if (req.method === 'PATCH') {
      const body = await parseBody(req);
      const { sessionKey, status, lastKnownLocation, anomalyType } = body || {};
      if (!sessionKey) return res.status(400).json({ error: 'sessionKey required' });

      const updated = await getOne(
        `UPDATE pulse_sessions SET
          status = COALESCE($2, status),
          last_known_lat = COALESCE($3, last_known_lat),
          last_known_lon = COALESCE($4, last_known_lon),
          last_movement_at = CASE WHEN $3 IS NOT NULL THEN NOW() ELSE last_movement_at END,
          anomaly_type = COALESCE($5, anomaly_type),
          ended_at = CASE WHEN $2 = 'ended' THEN NOW() ELSE ended_at END
         WHERE session_key = $1 AND user_id = $6
         RETURNING *`,
        [
          sessionKey,
          status || null,
          lastKnownLocation?.latitude ?? null,
          lastKnownLocation?.longitude ?? null,
          anomalyType || null,
          user.id,
        ]
      );
      if (!updated) return res.status(404).json({ error: 'Not found' });
      return res.status(200).json({ session: updated });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[pulse/session]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
