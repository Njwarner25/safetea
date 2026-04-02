const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

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

    // Get contacts FIRST — this is fast
    var contacts = [];
    try {
      contacts = await getMany(
        'SELECT contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
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

    // Calculate duration
    var minutesActive = Math.round((Date.now() - new Date(session.created_at).getTime()) / 60000);
    var displayName = session.custom_display_name || session.display_name || 'A SafeTea user';
    var gpsLink = latitude && longitude
      ? 'https://maps.google.com/?q=' + latitude + ',' + longitude
      : (session.latitude && session.longitude ? 'https://maps.google.com/?q=' + session.latitude + ',' + session.longitude : null);
    var recordingUrl = 'https://www.getsafetea.app/recording-status?key=' + sessionKey;

    var updateMsg =
      'SAFETEA EMERGENCY UPDATE (' + minutesActive + ' min)\n\n' +
      'A trusted contact may need your help and is unable to get to their phone.\n\n' +
      'Review this report and decide if this is an emergency. If so, call 911 with the information provided.\n\n' +
      'WHO: ' + displayName + '\n' +
      (gpsLink ? 'LOCATION: ' + gpsLink + '\n' : 'LOCATION: Unavailable\n') +
      'AUDIO: ' + chunkCount + ' clip(s) recorded\n' +
      (transcriptExcerpt ? 'TRANSCRIPT: "' + transcriptExcerpt + '"\n' : '') +
      '\nVIEW FULL REPORT:\n' +
      recordingUrl + '\n\n' +
      '1. Open the report link\n' +
      '2. Try to contact ' + displayName + '\n' +
      '3. If no response, call 911\n\n' +
      '- SafeTea Record & Protect';

    // SEND SMS IMMEDIATELY — don't let transcription block this
    var contactsNotified = 0;
    var twilioSid = process.env.TWILIO_ACCOUNT_SID;
    var twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    var twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;

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
    try {
      await run(
        `UPDATE recording_sessions SET last_update_sent_at = NOW() WHERE session_key = $1`,
        [sessionKey]
      );
    } catch (e) {}

    // Try transcription AFTER sending SMS (best-effort, for next update)
    // Only attempt if we have chunks and no existing transcript
    if (chunkCount > 0 && !transcriptExcerpt) {
      try {
        var { transcribeAudio } = require('./transcribe');
        // Clear cache and re-transcribe — but with a 5-second internal timeout
        await run('UPDATE recording_sessions SET transcript = NULL WHERE session_key = $1', [sessionKey]);
        // Only transcribe the latest 3 chunks to stay within time limits
        var latestChunks = await getMany(
          'SELECT audio_data, chunk_number, duration_ms FROM recording_chunks WHERE session_key = $1 ORDER BY chunk_number DESC LIMIT 3',
          [sessionKey]
        );
        if (latestChunks && latestChunks.length > 0) {
          var OPENAI_API_KEY = process.env.OPENAI_API_KEY;
          if (OPENAI_API_KEY) {
            var transcripts = [];
            for (var c = latestChunks.length - 1; c >= 0; c--) {
              try {
                var chunk = latestChunks[c];
                var audioBuffer = Buffer.from(chunk.audio_data, 'base64');
                var boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
                var formParts = [];
                formParts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="file"; filename="chunk-' + chunk.chunk_number + '.webm"\r\nContent-Type: audio/webm\r\n\r\n');
                formParts.push(audioBuffer);
                formParts.push('\r\n--' + boundary + '\r\nContent-Disposition: form-data; name="model"\r\n\r\nwhisper-1\r\n');
                formParts.push('--' + boundary + '\r\nContent-Disposition: form-data; name="language"\r\n\r\nen\r\n');
                formParts.push('--' + boundary + '--\r\n');
                var bodyParts = formParts.map(function(p) { return typeof p === 'string' ? Buffer.from(p) : p; });
                var bodyBuffer = Buffer.concat(bodyParts);
                var resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
                  method: 'POST',
                  headers: { 'Authorization': 'Bearer ' + OPENAI_API_KEY, 'Content-Type': 'multipart/form-data; boundary=' + boundary },
                  body: bodyBuffer,
                });
                if (resp.ok) {
                  var data = await resp.json();
                  if (data.text && data.text.trim()) transcripts.push(data.text.trim());
                }
              } catch (te) {}
            }
            if (transcripts.length > 0) {
              await run('UPDATE recording_sessions SET transcript = $1 WHERE session_key = $2', [transcripts.join(' '), sessionKey]);
            }
          }
        }
      } catch (e) {
        console.error('[Update] Background transcription failed:', e.message);
      }
    }

    return res.status(200).json({
      success: true,
      minutesActive: minutesActive,
      contactsNotified: contactsNotified,
      contactsFound: contacts.length,
      twilioConfigured: !!(twilioSid && twilioAuth && twilioPhone),
    });
  } catch (err) {
    console.error('Recording update error:', err);
    return res.status(500).json({ error: 'Failed to send recording update' });
  }
};
