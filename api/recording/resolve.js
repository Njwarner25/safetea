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
      `SELECT * FROM recording_sessions WHERE session_key = $1 AND user_id = $2`,
      [sessionKey, user.id]
    );

    if (!session) {
      return res.status(404).json({ error: 'Recording session not found' });
    }

    // Mark as stopped/resolved
    await run(
      `UPDATE recording_sessions SET status = 'stopped', stopped_at = NOW() WHERE session_key = $1`,
      [sessionKey]
    );

    // Send "I'm Safe" SMS (recording_contacts first, then date_trusted_contacts fallback)
    let contactsNotified = 0;
    let contacts = [];
    try {
      contacts = await getMany(
        'SELECT contact_name, contact_phone FROM recording_contacts WHERE user_id = $1',
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

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    if (twilioSid && twilioAuth && twilioPhone && contacts.length > 0) {
      const twilio = require('twilio')(twilioSid, twilioAuth);
      const displayName = user.custom_display_name || user.display_name || 'A SafeTea user';

      const message =
        `✅ Update — SafeTea\n` +
        `━━━━━━━━━━━━━━━━━\n` +
        `${displayName} has stopped recording and marked themselves as safe.\n\n` +
        `Live tracking deactivated.\n` +
        `━━━━━━━━━━━━━━━━━`;

      for (const contact of contacts) {
        try {
          await twilio.messages.create({
            body: message,
            from: twilioPhone,
            to: contact.contact_phone,
          });
          contactsNotified++;
        } catch (smsErr) {
          console.error(`Safe SMS failed to ${contact.contact_phone}:`, smsErr.message);
        }
      }
    }

    // Trigger transcription in background (non-blocking)
    transcribeAudio(sessionKey).catch(function(err) {
      console.error('[Resolve] Background transcription failed:', err.message);
    });

    // Count total chunks
    const chunkCount = await getOne(
      `SELECT COUNT(*) as total FROM recording_chunks WHERE session_key = $1`,
      [sessionKey]
    );

    return res.status(200).json({
      success: true,
      sessionKey,
      totalChunks: parseInt(chunkCount.total, 10),
      contactsNotified,
      stoppedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('Recording resolve error:', err);
    return res.status(500).json({ error: 'Failed to resolve recording', details: err.message });
  }
};
