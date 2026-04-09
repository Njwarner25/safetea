const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

// POST /api/safelink/connect — verified user requests to connect to a public SafeLink session.
// Body: { sessionKey, message? }
// Returns: { request } — request stays "pending" until host responds.
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const trustScore = typeof user.trust_score === 'number' ? user.trust_score : 0;
  if (trustScore < 100) {
    return res.status(403).json({
      error: 'Connecting with other users requires a perfect trust score (100/100). Complete every verification step in your profile to unlock.',
      code: 'trust_score_required',
      required: 100,
      current: trustScore,
    });
  }

  const body = await parseBody(req);
  const sessionKey = (body.sessionKey || '').toString().trim();
  const message = (body.message || '').toString().trim().substring(0, 280) || null;
  if (!sessionKey) return res.status(400).json({ error: 'sessionKey required' });

  try {
    const session = await getOne(
      `SELECT id, user_id, status, is_public, max_connections
       FROM safelink_sessions WHERE session_key = $1`,
      [sessionKey]
    );

    if (!session) return res.status(404).json({ error: 'Session not found' });
    if (session.status !== 'active') return res.status(410).json({ error: 'Session ended' });
    if (!session.is_public) return res.status(403).json({ error: 'This session is not public' });
    if (session.user_id === user.id) return res.status(400).json({ error: 'You cannot connect to your own session' });

    // Cap accepted connections at session.max_connections (default 5)
    const acceptedRow = await getOne(
      `SELECT COUNT(*) AS c FROM safelink_connections WHERE session_id = $1 AND status = 'accepted'`,
      [session.id]
    );
    const acceptedCount = parseInt(acceptedRow?.c || 0, 10);
    if (acceptedCount >= (session.max_connections || 5)) {
      return res.status(409).json({ error: 'This SafeLink is full' });
    }

    // Insert or return existing request
    const existing = await getOne(
      `SELECT id, status FROM safelink_connections WHERE session_id = $1 AND requester_user_id = $2`,
      [session.id, user.id]
    );

    if (existing) {
      return res.status(200).json({
        request: { id: existing.id, status: existing.status },
        message: 'You already requested to connect',
      });
    }

    const inserted = await getOne(
      `INSERT INTO safelink_connections (session_id, session_key, host_user_id, requester_user_id, message, status)
       VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id, status, created_at`,
      [session.id, sessionKey, session.user_id, user.id, message]
    );

    return res.status(201).json({
      request: {
        id: inserted.id,
        status: inserted.status,
        createdAt: inserted.created_at,
      },
    });
  } catch (err) {
    console.error('SafeLink connect error:', err);
    return res.status(500).json({ error: 'Failed to send connection request', details: err.message });
  }
};
