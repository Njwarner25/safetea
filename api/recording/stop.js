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
  const { sessionKey } = body;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Missing sessionKey' });
  }

  try {
    const session = await getOne(
      `SELECT * FROM recording_sessions WHERE session_key = $1 AND user_id = $2 AND status = 'active'`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Active recording session not found' });
    }

    await run(
      `UPDATE recording_sessions SET status = 'stopped', stopped_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    // Count total chunks
    const chunkCount = await getOne(
      `SELECT COUNT(*) as total FROM recording_chunks WHERE session_key = $1`,
      [sessionKey]
    );

    // Trigger transcription and send transcript SMS for SOS recordings
    transcribeAudio(sessionKey).then(async function(tResult) {
      // Check if this recording was triggered by SOS
      if (session.sos_event_id && tResult && tResult.success && tResult.transcript && tResult.transcript !== '(No speech detected)') {
        try {
          var sessionWithUser = await getOne(
            `SELECT rs.*, u.display_name, u.custom_display_name
             FROM recording_sessions rs
             JOIN users u ON rs.user_id = u.id
             WHERE rs.session_key = $1`,
            [sessionKey]
          );

          // Get contacts
          var contacts = [];
          try {
            contacts = await getMany(
              'SELECT contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
              [session.user_id]
            );
          } catch (e) {}

          if (contacts.length === 0) {
            var checkout = await getOne(
              `SELECT id FROM date_checkouts WHERE user_id = $1 AND status IN ('checked_out', 'active') ORDER BY created_at DESC LIMIT 1`,
              [session.user_id]
            );
            if (checkout) {
              contacts = await getMany(
                `SELECT * FROM date_trusted_contacts WHERE checkout_id = $1`,
                [checkout.id]
              );
            }
          }

          if (contacts.length > 0) {
            var displayName = (sessionWithUser && (sessionWithUser.custom_display_name || sessionWithUser.display_name)) || 'A SafeTea user';
            var excerpt = tResult.transcript.length > 500
              ? tResult.transcript.substring(0, 500) + '...'
              : tResult.transcript;
            var recordingUrl = 'https://www.getsafetea.app/recording-status?key=' + sessionKey;

            var followUpMsg =
              '📝 SOS RECORDING TRANSCRIPT — SafeTea\n' +
              '━━━━━━━━━━━━━━━━━\n' +
              displayName + '\'s SOS recording has ended.\n\n' +
              'Transcript:\n"' + excerpt + '"\n\n' +
              'Full audio + transcript: ' + recordingUrl + '\n' +
              '━━━━━━━━━━━━━━━━━';

            var twilioSid = process.env.TWILIO_ACCOUNT_SID;
            var twilioAuth = process.env.TWILIO_AUTH_TOKEN;
            var twilioPhone = process.env.TWILIO_PHONE_NUMBER;

            if (twilioSid && twilioAuth && twilioPhone) {
              var twilio = require('twilio')(twilioSid, twilioAuth);
              for (var i = 0; i < contacts.length; i++) {
                try {
                  await twilio.messages.create({
                    body: followUpMsg,
                    from: twilioPhone,
                    to: contacts[i].contact_phone,
                  });
                } catch (smsErr) {
                  console.error('Transcript SMS failed to ' + contacts[i].contact_phone + ':', smsErr.message);
                }
              }
            }
          }
        } catch (tErr) {
          console.error('[Stop] SOS transcript notification failed:', tErr.message);
        }
      }
    }).catch(function(err) {
      console.error('[Stop] Background transcription failed:', err.message);
    });

    return res.status(200).json({
      success: true,
      sessionKey,
      totalChunks: parseInt(chunkCount.total, 10),
      stoppedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Recording stop error:', err);
    return res.status(500).json({ error: 'Failed to stop recording', details: err.message });
  }
};
