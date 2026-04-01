const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
    return res.status(403).json({ error: 'Record & Protect requires SafeTea Pro' });
  }

  const body = await parseBody(req);
  const { latitude, longitude } = body;

  try {
    // Ensure tables exist
    await run(`CREATE TABLE IF NOT EXISTS recording_sessions (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'active',
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      contacts_notified INTEGER DEFAULT 0,
      escalated_at TIMESTAMPTZ,
      stopped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE TABLE IF NOT EXISTS recording_chunks (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) NOT NULL,
      chunk_number INTEGER NOT NULL,
      audio_data TEXT NOT NULL,
      duration_ms INTEGER,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Generate unique session key
    const sessionKey = crypto.randomBytes(24).toString('hex');

    // Create session
    const session = await getOne(
      `INSERT INTO recording_sessions (session_key, user_id, latitude, longitude)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [sessionKey, user.id, latitude || null, longitude || null]
    );

    // Send SMS to trusted contacts
    let contactsNotified = 0;
    const activeCheckout = await getOne(
      `SELECT * FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
      [user.id]
    );

    let contacts = [];
    if (activeCheckout) {
      contacts = await getMany(
        `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
        [activeCheckout.id]
      );
    }

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
      const twilio = require('twilio')(twilioSid, twilioAuth);
      const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';
      const gpsLink = latitude && longitude
        ? `https://maps.google.com/?q=${latitude},${longitude}`
        : null;
      const recordingUrl = `https://www.getsafetea.app/recording-status?key=${sessionKey}`;

      const message =
        `🔴 RECORDING ACTIVATED — SafeTea\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `${displayName} activated Record & Protect.\n\n` +
        `Audio is being recorded and uploaded in real-time.\n` +
        (gpsLink ? `GPS Location: ${gpsLink}\n\n` : '\n') +
        `📋 WHAT IS AN OUTCRY WITNESS?\n` +
        `You may be what's legally known as an "outcry witness" — the first person a victim tells about an incident. In many states, your testimony as an outcry witness carries special evidentiary weight in court. This recording may serve as critical evidence.\n\n` +
        `What to do:\n` +
        `• Save this message\n` +
        `• Try to contact them\n` +
        `• If no response, call 911 with the GPS location above\n\n` +
        `Listen to recording: ${recordingUrl}\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `Sent via SafeTea Record & Protect`;

      for (const contact of contacts) {
        try {
          await twilio.messages.create({
            body: message,
            from: twilioPhone,
            to: contact.contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error(`Recording SMS failed to ${contact.contact_phone}:`, smsErr.message);
        }
      }

      // Update contacts notified count
      await run(
        `UPDATE recording_sessions SET contacts_notified = $1 WHERE session_key = $2`,
        [contactsNotified, sessionKey]
      );
    }

    return res.status(201).json({
      success: true,
      sessionKey,
      sessionId: session.id,
      contactsNotified,
    });
  } catch (err) {
    console.error('Recording start error:', err);
    return res.status(500).json({ error: 'Failed to start recording', details: err.message });
  }
};
