const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
    return res.status(403).json({ error: 'SafeLink requires SafeTea+ ($7.99/mo)' });
  }

  const body = await parseBody(req);
  const { latitude, longitude, label, isPublic, broadcastMessage, category } = body;

  // Public broadcasts require identity verification (anti-stalker gate)
  const wantsPublic = !!isPublic;
  if (wantsPublic) {
    const isVerified = user.identity_verified === true || (typeof user.trust_score === 'number' && user.trust_score >= 60);
    if (!isVerified) {
      return res.status(403).json({
        error: 'Public SafeLink broadcasts require identity verification',
        code: 'verification_required',
      });
    }
  }

  try {
    // Ensure tables exist
    await run(`CREATE TABLE IF NOT EXISTS safelink_sessions (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) UNIQUE NOT NULL,
      user_id INTEGER REFERENCES users(id),
      status VARCHAR(20) DEFAULT 'active',
      label VARCHAR(120),
      latitude DECIMAL(10,8),
      longitude DECIMAL(11,8),
      contacts_notified INTEGER DEFAULT 0,
      stopped_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE TABLE IF NOT EXISTS safelink_locations (
      id SERIAL PRIMARY KEY,
      session_key VARCHAR(100) NOT NULL,
      latitude DECIMAL(10,8) NOT NULL,
      longitude DECIMAL(11,8) NOT NULL,
      accuracy_meters INTEGER,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    )`);
    try { await run(`CREATE INDEX IF NOT EXISTS idx_safelink_locations_key ON safelink_locations(session_key, recorded_at)`); } catch(e) {}

    // Ensure v2 columns exist (idempotent)
    try { await run(`ALTER TABLE safelink_sessions ADD COLUMN IF NOT EXISTS is_public BOOLEAN DEFAULT FALSE`); } catch(e) {}
    try { await run(`ALTER TABLE safelink_sessions ADD COLUMN IF NOT EXISTS broadcast_message TEXT`); } catch(e) {}
    try { await run(`ALTER TABLE safelink_sessions ADD COLUMN IF NOT EXISTS category VARCHAR(40)`); } catch(e) {}
    try { await run(`ALTER TABLE safelink_sessions ADD COLUMN IF NOT EXISTS max_connections INTEGER DEFAULT 5`); } catch(e) {}

    // Generate unique session key
    const sessionKey = crypto.randomBytes(24).toString('hex');

    const cleanCategory = (category || '').toString().trim().substring(0, 40) || null;
    const cleanBroadcast = wantsPublic ? (broadcastMessage || '').toString().trim().substring(0, 280) || null : null;

    const session = await getOne(
      `INSERT INTO safelink_sessions (session_key, user_id, label, latitude, longitude, is_public, broadcast_message, category)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [sessionKey, user.id, (label || '').substring(0, 120) || null, latitude || null, longitude || null, wantsPublic, cleanBroadcast, cleanCategory]
    );

    // Initial breadcrumb
    if (latitude && longitude) {
      try {
        await run(
          `INSERT INTO safelink_locations (session_key, latitude, longitude) VALUES ($1, $2, $3)`,
          [sessionKey, latitude, longitude]
        );
      } catch(e) {}
    }

    // Look up trusted contacts (recording_contacts shared pool)
    let contacts = [];
    try {
      await run(`CREATE TABLE IF NOT EXISTS recording_contacts (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        contact_name VARCHAR(100) NOT NULL,
        contact_phone VARCHAR(30) NOT NULL,
        contact_email VARCHAR(150),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(user_id, contact_phone)
      )`);
      contacts = await getMany(
        'SELECT contact_name, contact_phone, contact_email FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
    } catch (e) { /* table may not exist yet */ }

    const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';
    const trackingUrl = `https://www.getsafetea.app/safelink-track?key=${sessionKey}`;

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    let twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;
    const twilioConfigured = !!(twilioSid && twilioAuth && twilioPhone);

    let contactsNotified = 0;
    let smsErrors = [];

    if (contacts.length > 0 && twilioConfigured) {
      const smsBody =
        `${displayName} just started a SafeLink on SafeTea. ` +
        `You can follow their live location until they end the session: ${trackingUrl}\n\n` +
        `Reply STOP to opt out.`;

      const twilio = require('twilio')(twilioSid, twilioAuth);
      for (const contact of contacts) {
        try {
          await twilio.messages.create({
            body: smsBody,
            from: twilioPhone,
            to: contact.contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error(`SafeLink SMS failed to ${contact.contact_phone}:`, smsErr.message);
          smsErrors.push(smsErr.message);
        }
      }

      await run(
        `UPDATE safelink_sessions SET contacts_notified = $1 WHERE session_key = $2`,
        [contactsNotified, sessionKey]
      );
    }

    return res.status(201).json({
      success: true,
      sessionKey,
      sessionId: session.id,
      isPublic: wantsPublic,
      broadcastMessage: cleanBroadcast,
      category: cleanCategory,
      contactsFound: contacts.length,
      contactsNotified,
      twilioConfigured,
      smsErrors: smsErrors.length > 0 ? smsErrors : undefined,
      shareData: {
        displayName,
        trackingUrl,
      },
    });
  } catch (err) {
    console.error('SafeLink start error:', err);
    return res.status(500).json({ error: 'Failed to start SafeLink', details: err.message });
  }
};
