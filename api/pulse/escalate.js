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

    // Fan-out SMS to trusted contacts via Twilio. Matches the pattern in
    // api/dates/sos.js. Email fan-out can be layered in later via SendGrid.
    let contactsNotified = 0;
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (contacts.length > 0 && twilioSid && twilioAuth && twilioPhone) {
      const displayName = user.display_name || user.email || 'A SafeTea user';
      const anomalyLabel = ({
        movement_anomaly: 'has stopped moving unexpectedly',
        route_deviation: 'has deviated from their expected route',
        missed_checkin: 'has missed a scheduled check-in',
        no_response: 'is not responding to safety prompts',
      })[anomalyType] || `has triggered a "${anomalyType}" safety alert`;

      const lat = typeof body.latitude === 'number' ? body.latitude : null;
      const lng = typeof body.longitude === 'number' ? body.longitude : null;
      const mapsUrl = lat && lng ? ` Last known location: https://maps.google.com/?q=${lat},${lng}.` : '';
      const shortSms = `SafeTea Pulse alert: ${displayName} ${anomalyLabel} during a Safe Walk.${mapsUrl} Please reach out and check in.`;

      const twilio = require('twilio')(twilioSid, twilioAuth);
      for (const contact of contacts) {
        try {
          await twilio.messages.create({
            body: shortSms,
            from: twilioPhone,
            to: contact.contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error(`[pulse/escalate] SMS failed to ${contact.contact_phone}:`, smsErr.message);
        }
      }
    }

    const row = await getOne(
      `INSERT INTO pulse_escalations
        (session_key, user_id, anomaly_type, payload, contacts_notified)
       VALUES ($1,$2,$3,$4,$5) RETURNING *`,
      [sessionKey, user.id, anomalyType, JSON.stringify(body), contactsNotified]
    );

    return res.status(200).json({
      escalation: row,
      contactsFound: contacts.length,
      contactsNotified: contactsNotified,
      dispatched: contactsNotified > 0,
    });
  } catch (err) {
    console.error('[pulse/escalate]', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
