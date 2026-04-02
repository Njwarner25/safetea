const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const { transcribeAudio } = require('./transcribe');

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
    // Verify this is an active recording owned by this user (works for both SOS and standalone recordings)
    const session = await getOne(
      `SELECT rs.*, u.display_name, u.custom_display_name
       FROM recording_sessions rs
       JOIN users u ON rs.user_id = u.id
       WHERE rs.session_key = $1 AND rs.user_id = $2 AND rs.status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording not found' });
    }

    // Check rate limit — don't send more often than every 50 seconds
    if (session.last_update_sent_at) {
      var secondsSinceLast = (Date.now() - new Date(session.last_update_sent_at).getTime()) / 1000;
      if (secondsSinceLast < 50) {
        return res.status(200).json({ success: true, skipped: true, reason: 'Too soon since last update' });
      }
    }

    // Update location
    if (latitude && longitude) {
      await run(
        `UPDATE recording_sessions SET latitude = $1, longitude = $2 WHERE session_key = $3`,
        [latitude, longitude, sessionKey]
      );
    }

    // Get live transcript by transcribing current chunks
    var transcriptExcerpt = '';
    try {
      var tResult = await transcribeAudio(sessionKey);
      if (tResult && tResult.success && tResult.transcript && tResult.transcript !== '(No speech detected)') {
        var t = tResult.transcript;
        transcriptExcerpt = t.length > 300 ? '...' + t.substring(t.length - 300) : t;
      }
    } catch (e) {
      console.error('[Update] Live transcription failed:', e.message);
    }

    // Get contacts
    var contacts = [];
    try {
      contacts = await getMany(
        'SELECT contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
        [user.id]
      );
    } catch (e) {}

    if (contacts.length === 0) {
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
    }

    // Calculate duration
    var minutesActive = Math.round((Date.now() - new Date(session.created_at).getTime()) / 60000);
    var displayName = session.custom_display_name || session.display_name || 'A SafeTea user';
    var gpsLink = latitude && longitude
      ? 'https://maps.google.com/?q=' + latitude + ',' + longitude
      : (session.latitude && session.longitude ? 'https://maps.google.com/?q=' + session.latitude + ',' + session.longitude : null);
    var recordingUrl = 'https://www.getsafetea.app/recording-status?key=' + sessionKey;

    var isSOS = !!session.sos_event_id;
    var updateMsg =
      (isSOS ? '📍 SOS UPDATE — SafeTea\n' : '📍 RECORDING UPDATE — SafeTea\n') +
      '━━━━━━━━━━━━━━━━━\n' +
      displayName + '\'s recording has been active for ' + minutesActive + ' min.\n\n' +
      (gpsLink ? 'Updated location: ' + gpsLink + '\n' : 'Location: unavailable\n') +
      (transcriptExcerpt ? '\nLatest audio:\n"' + transcriptExcerpt + '"\n' : '') +
      '\n🔴 Live recording: ' + recordingUrl + '\n' +
      '━━━━━━━━━━━━━━━━━';

    var contactsNotified = 0;
    var twilioSid = process.env.TWILIO_ACCOUNT_SID;
    var twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    var twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
      var twilio = require('twilio')(twilioSid, twilioAuth);
      for (var i = 0; i < contacts.length; i++) {
        try {
          await twilio.messages.create({
            body: updateMsg,
            from: twilioPhone,
            to: contacts[i].contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error('Recording update SMS failed to ' + contacts[i].contact_phone + ':', smsErr.message);
        }
      }
    }

    // Record when we last sent an update
    await run(
      `UPDATE recording_sessions SET last_update_sent_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    return res.status(200).json({
      success: true,
      minutesActive: minutesActive,
      contactsNotified: contactsNotified,
    });
  } catch (err) {
    console.error('Recording update error:', err);
    return res.status(500).json({ error: 'Failed to send recording update' });
  }
};
