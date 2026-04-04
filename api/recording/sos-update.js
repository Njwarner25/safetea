const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const { sendEmergencyReportEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { sessionKey, latitude, longitude } = body;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Missing sessionKey' });
  }

  try {
    // Verify this is an active recording owned by this user
    var session = await getOne(
      `SELECT rs.*, u.display_name, u.custom_display_name
       FROM recording_sessions rs
       JOIN users u ON rs.user_id = u.id
       WHERE rs.session_key = $1 AND rs.user_id = $2 AND rs.status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording not found' });
    }

    // Only send at 1-minute and 3-minute marks (contacts have live tracking page after that)
    var minutesActive = Math.round((Date.now() - new Date(session.created_at).getTime()) / 60000);
    var updatesSent = 0;
    if (session.last_update_sent_at) {
      // Count how many updates have been sent by checking the timestamp pattern
      var secondsSinceLast = (Date.now() - new Date(session.last_update_sent_at).getTime()) / 1000;
      if (secondsSinceLast < 50) {
        return res.status(200).json({ success: true, skipped: true, reason: 'Too soon since last update' });
      }
    }
    // After 4 minutes, stop sending updates — contacts have the live tracking page
    if (minutesActive > 4) {
      return res.status(200).json({ success: true, skipped: true, reason: 'Auto-updates complete (contacts have live tracking)' });
    }

    // Update location
    if (latitude && longitude) {
      await run(
        `UPDATE recording_sessions SET latitude = $1, longitude = $2 WHERE session_key = $3`,
        [latitude, longitude, sessionKey]
      );
    }

    // Get contacts FIRST — ensure contact_email column exists
    var contacts = [];
    try {
      try { await run(`ALTER TABLE recording_contacts ADD COLUMN IF NOT EXISTS contact_email VARCHAR(150)`); } catch(e) {}
      contacts = await getMany(
        'SELECT contact_name, contact_phone, contact_email FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
    } catch (e) {}

    if (contacts.length === 0) {
      try {
        var checkout = await getOne(
          `SELECT id FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
          [user.id]
        );
        if (checkout) {
          contacts = await getMany(
            `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
            [checkout.id]
          );
        }
      } catch (e) {}
    }

    // Use existing cached transcript (don't re-transcribe — it takes too long and causes timeouts)
    var transcriptExcerpt = '';
    try {
      var cachedSession = await getOne(
        'SELECT transcript FROM recording_sessions WHERE session_key = $1',
        [sessionKey]
      );
      if (cachedSession && cachedSession.transcript && cachedSession.transcript !== '(No speech detected)') {
        var t = cachedSession.transcript;
        transcriptExcerpt = t.length > 300 ? '...' + t.substring(t.length - 300) : t;
      }
    } catch (e) {}

    // Count total audio chunks
    var chunkCount = 0;
    try {
      var cc = await getOne('SELECT COUNT(*) AS total FROM recording_chunks WHERE session_key = $1', [sessionKey]);
      chunkCount = parseInt(cc.total) || 0;
    } catch (e) {}

    // Build update data
    var displayName = session.custom_display_name || session.display_name || 'A SafeTea user';
    var gpsLink = latitude && longitude
      ? 'https://maps.google.com/?q=' + latitude + ',' + longitude
      : (session.latitude && session.longitude ? 'https://maps.google.com/?q=' + session.latitude + ',' + session.longitude : null);
    var trackingUrl = 'https://www.getsafetea.app/recording-status?key=' + sessionKey;

    // Short SMS ping via Twilio + full email via SendGrid
    var shortSms = minutesActive <= 1
      ? "You're a trusted contact for " + displayName + " on SafeTea. They may need your help \u2014 check your email immediately."
      : "URGENT: " + displayName + "'s SafeTea recording has been active for " + minutesActive + " minutes. Check your email for updated location and audio.";

    var contactsNotified = 0;
    var emailsSent = 0;
    var twilioSid = process.env.TWILIO_ACCOUNT_SID;
    var twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    var twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;

    if (contacts.length > 0) {
      // Short SMS
      if (twilioSid && twilioAuth && twilioPhone) {
        var twilio = require('twilio')(twilioSid, twilioAuth);
        for (var i = 0; i < contacts.length; i++) {
          try {
            await twilio.messages.create({
              body: shortSms,
              from: twilioPhone,
              to: contacts[i].contact_phone,
            });
            contactsNotified++;
          } catch (smsErr) {
            console.error('Recording update SMS failed to ' + contacts[i].contact_phone + ':', smsErr.message);
          }
        }
      }

      // Full emergency email with updated GPS + transcript
      for (var j = 0; j < contacts.length; j++) {
        var contactEmail = contacts[j].contact_email || contacts[j].email;
        if (contactEmail) {
          try {
            await sendEmergencyReportEmail(contactEmail, {
              displayName: displayName,
              gpsLink: gpsLink,
              trackingUrl: trackingUrl,
              minutesActive: minutesActive,
              transcript: transcriptExcerpt || null,
              chunkCount: chunkCount
            });
            emailsSent++;
          } catch (emailErr) {
            console.error('Emergency email failed to ' + contactEmail + ':', emailErr.message);
          }
        }
      }
    }

    // Record when we last sent an update
    try {
      await run(
        `UPDATE recording_sessions SET last_update_sent_at = NOW() WHERE session_key = $1`,
        [sessionKey]
      );
    } catch (e) {}

    // Transcription removed from live updates — handled post-session only (in stop.js / resolve.js)

    return res.status(200).json({
      success: true,
      minutesActive: minutesActive,
      contactsNotified: contactsNotified,
      emailsSent: emailsSent,
      contactsFound: contacts.length,
      twilioConfigured: !!(twilioSid && twilioAuth && twilioPhone),
    });
  } catch (err) {
    console.error('Recording update error:', err);
    return res.status(500).json({ error: 'Failed to send recording update' });
  }
};
