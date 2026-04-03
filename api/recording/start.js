const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const crypto = require('crypto');
const { sendEmergencyReportEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
    return res.status(403).json({ error: 'Record & Protect requires SafeTea+ ($7.99/mo)' });
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
      last_update_sent_at TIMESTAMPTZ,
      transcript TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    // Add columns that may be missing from older table versions
    try { await run(`ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS last_update_sent_at TIMESTAMPTZ`); } catch(e) {}
    try { await run(`ALTER TABLE recording_sessions ADD COLUMN IF NOT EXISTS transcript TEXT`); } catch(e) {}

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

    // Get trusted contacts (recording_contacts first, then date_trusted_contacts fallback)
    let contactsNotified = 0;
    let emailsSent = 0;
    let contacts = [];
    try {
      contacts = await getMany(
        'SELECT contact_name, contact_phone, contact_email FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
    } catch (e) { /* table may not exist yet */ }

    if (contacts.length === 0) {
      const activeCheckout = await getOne(
        `SELECT * FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
        [user.id]
      );
      if (activeCheckout) {
        contacts = await getMany(
          `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
          [activeCheckout.id]
        );
      }
    }

    const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';
    const gpsLink = latitude && longitude
      ? `https://maps.google.com/?q=${latitude},${longitude}`
      : null;
    const trackingUrl = `https://www.getsafetea.app/recording-status?key=${sessionKey}`;

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    let twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;
    const twilioConfigured = !!(twilioSid && twilioAuth && twilioPhone);
    let smsErrors = [];

    if (contacts.length > 0) {
      // Short SMS ping via Twilio
      const shortSms = `You're a trusted contact for ${displayName} on SafeTea. They may need your help — check your email immediately.`;

      if (twilioConfigured) {
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
            console.error(`Recording SMS failed to ${contact.contact_phone}:`, smsErr.message);
            smsErrors.push(smsErr.message);
          }
        }
      }

      // Full emergency email via SendGrid to contacts with email
      for (const contact of contacts) {
        const email = contact.contact_email || contact.email;
        if (email) {
          try {
            await sendEmergencyReportEmail(email, {
              displayName,
              gpsLink,
              trackingUrl,
              minutesActive: 0,
              transcript: null,
              chunkCount: 0
            });
            emailsSent++;
          } catch (emailErr) {
            console.error(`Emergency email failed to ${email}:`, emailErr.message);
          }
        }
      }

      // Update contacts notified count
      await run(
        `UPDATE recording_sessions SET contacts_notified = $1 WHERE session_key = $2`,
        [contactsNotified + emailsSent, sessionKey]
      );
    }

    return res.status(201).json({
      success: true,
      sessionKey,
      sessionId: session.id,
      contactsNotified,
      emailsSent,
      contactsFound: contacts.length,
      twilioConfigured,
      smsErrors: smsErrors.length > 0 ? smsErrors : undefined,
      shareData: {
        displayName,
        gpsLink,
        trackingUrl
      }
    });
  } catch (err) {
    console.error('Recording start error:', err);
    return res.status(500).json({ error: 'Failed to start recording', details: err.message });
  }
};
