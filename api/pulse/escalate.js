const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

/**
 * Pulse escalation stub.
 *
 * Phase 1: accepts an alert payload from the mobile client, records it,
 * and reuses the same trusted-contact lookup pattern as api/recording/start.js.
 * Actual SMS/email dispatch (Twilio + SendGrid) is wired through the existing
 * services — see TODO below. For Phase 1 we record-and-return so the client
 * flow can be exercised end-to-end before fan-out is enabled.
 */
async function ensureSchema() {
  await run(`CREATE TABLE IF NOT EXISTS pulse_escalations (
    id SERIAL PRIMARY KEY,
    session_key VARCHAR(64) NOT NULL,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    anomaly_type VARCHAR(40) NOT NULL,
    payload JSONB NOT NULL,
    contacts_notified INTEGER DEFAULT 0,
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
    const { sessionKey, anomalyType } = body || {};
    if (!sessionKey || !anomalyType) {
      return res.status(400).json({ error: 'sessionKey and anomalyType required' });
    }

    // Fetch contacts (reuse recording_contacts → date_trusted_contacts fallback)
    let contacts = [];
    try {
      contacts = await getMany(
        `SELECT contact_name, contact_phone, contact_email
           FROM recording_contacts WHERE user_id = $1`,
        [user.id]
      );
    } catch (_) {}
    if (contacts.length === 0) {
      try {
        contacts = await getMany(
          `SELECT contact_name, contact_phone, contact_email
             FROM date_trusted_contacts
             WHERE checkout_id IN (
               SELECT id FROM date_checkouts WHERE user_id = $1 AND status = 'active'
             )`,
          [user.id]
        );
      } catch (_) {}
    }

    // TODO(phase-1 follow-up): reuse the Twilio + SendGrid fan-out from
    // api/recording/start.js once copy/templates for Pulse are approved.
    // Left as a record-only stub so client flow can be tested first.

    const row = await getOne(
      `INSERT INTO pulse_escalations
        (session_key, user_id, anomaly_type, payload, contacts_notified)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [sessionKey, user.id, anomalyType, JSON.stringify(body), contacts.length]
    );

    return res.status(200).json({
      escalation: row,
      contactsFound: contacts.length,
      dispatched: false,
      note: 'Phase 1 stub — dispatch disabled pending copy approval',
    });
  } catch (err) {
    console.error('[pulse/escalate]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
