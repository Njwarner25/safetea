const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');
const { transcribeAudio } = require('./transcribe');
const { sendSafeConfirmationEmail } = require('../../services/email');

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

    // Send "I'm Safe" short SMS + email (recording_contacts first, then date_trusted_contacts fallback)
    let contactsNotified = 0;
    let emailsSent = 0;
    let contacts = [];
    try {
      try { await run(`ALTER TABLE recording_contacts ADD COLUMN IF NOT EXISTS contact_email VARCHAR(150)`); } catch(e) {}
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
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    let twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;

    if (contacts.length > 0) {
      const shortSms = `${displayName} has marked themselves safe on SafeTea. No further action needed.`;

      // Short SMS via Twilio
      if (twilioSid && twilioAuth && twilioPhone) {
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
            console.error(`Safe SMS failed to ${contact.contact_phone}:`, smsErr.message);
          }
        }
      }

      // Safe confirmation email via SendGrid
      for (const contact of contacts) {
        const email = contact.contact_email || contact.email;
        if (email) {
          try {
            await sendSafeConfirmationEmail(email, displayName);
            emailsSent++;
          } catch (emailErr) {
            console.error(`Safe email failed to ${email}:`, emailErr.message);
          }
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
