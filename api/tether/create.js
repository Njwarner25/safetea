const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');
const { getTrustLevel } = require('../_utils/trust-level');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const trust = await getTrustLevel(user);
  if (trust.level < 3) {
    return res.status(403).json({
      error: 'Tether requires Trust Level 3 (Trusted User).',
      current_level: trust.level,
      progress: trust.progress
    });
  }

  try {
    const body = await parseBody(req);
    const {
      session_name,
      distance_threshold_ft,
      night_mode_enabled,
      emergency_escalation_enabled
    } = body;

    // Validate distance threshold
    const validThresholds = [100, 200, 300, 400, 500];
    const threshold = parseInt(distance_threshold_ft) || 300;
    if (!validThresholds.includes(threshold)) {
      return res.status(400).json({ error: 'distance_threshold_ft must be one of: 100, 200, 300, 400, 500' });
    }

    // Generate 6-digit join code
    const joinCode = String(Math.floor(100000 + Math.random() * 900000));
    const joinCodeHash = crypto.createHash('sha256').update(joinCode).digest('hex');

    // Generate UUID QR token
    const qrToken = crypto.randomUUID();
    const qrTokenHash = crypto.createHash('sha256').update(qrToken).digest('hex');

    // Code expires in 5 minutes
    const codeExpiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();

    const cleanName = (session_name || 'Tether Session').toString().trim().substring(0, 120);

    // Insert session
    const session = await getOne(
      `INSERT INTO tether_sessions (host_user_id, session_name, join_code_hash, qr_token_hash, code_expires_at, distance_threshold_ft, night_mode_enabled, emergency_escalation_enabled)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [String(user.id), cleanName, joinCodeHash, qrTokenHash, codeExpiresAt, threshold, !!night_mode_enabled, !!emergency_escalation_enabled]
    );

    // Add host as first member
    const displayName = user.custom_display_name || user.display_name || 'Host';
    await run(
      `INSERT INTO tether_members (session_id, user_id, display_name, role, status)
       VALUES ($1, $2, $3, 'host', 'active')`,
      [session.id, String(user.id), displayName]
    );

    // Log event
    await run(
      `INSERT INTO tether_events (session_id, user_id, event_type, metadata)
       VALUES ($1, $2, 'session_created', $3)`,
      [session.id, String(user.id), JSON.stringify({ session_name: cleanName, distance_threshold_ft: threshold })]
    );

    return res.status(201).json({
      success: true,
      session,
      join_code: joinCode,
      qr_token: qrToken
    });
  } catch (err) {
    console.error('Tether create error:', err);
    return res.status(500).json({ error: 'Failed to create Tether session', details: err.message });
  }
};
