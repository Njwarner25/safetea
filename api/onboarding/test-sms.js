const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

// Normalize phone number to E.164 — same logic as recording_contacts insert path
function normalizePhone(phone) {
  if (!phone) return '';
  var cleaned = String(phone).replace(/[^0-9+]/g, '');
  if (!cleaned) return '';
  if (cleaned.startsWith('+')) return cleaned;
  // Strip a leading 1 and re-prefix with +1 to keep behavior identical to contacts.js
  return '+1' + cleaned.replace(/^1/, '');
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const body = await parseBody(req);
    const rawName = (body && body.contactName) ? String(body.contactName).trim() : '';
    const rawPhone = (body && body.contactPhone) ? String(body.contactPhone).trim() : '';

    if (!rawName || !rawPhone) {
      return res.status(400).json({ error: 'contactName and contactPhone are required' });
    }

    const phone = normalizePhone(rawPhone);
    if (!phone || phone.replace(/[^0-9]/g, '').length < 10) {
      return res.status(400).json({ error: 'Please enter a valid phone number' });
    }

    // Lazy-add the abuse-prevention column on users — matches the codebase's lazy ALTER pattern.
    try {
      await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS onboarding_test_sms_sent_at TIMESTAMPTZ');
    } catch (e) { /* best-effort */ }

    // One-shot: if the user has already fired their onboarding test SMS, refuse.
    const fresh = await getOne('SELECT onboarding_test_sms_sent_at FROM users WHERE id = $1', [user.id]);
    if (fresh && fresh.onboarding_test_sms_sent_at) {
      return res.status(429).json({ error: 'Test message already sent for this account.' });
    }

    // Verify the user owns this contact (same user_id + contact_phone in recording_contacts).
    const owned = await getOne(
      'SELECT id, contact_name FROM recording_contacts WHERE user_id = $1 AND contact_phone = $2',
      [user.id, phone]
    );
    if (!owned) {
      return res.status(404).json({ error: 'Contact not found on this account' });
    }

    // Prefer the just-saved contact_name (the form value), but fall back to the row's saved name.
    const contactName = (rawName || owned.contact_name || 'You').substring(0, 100);

    // Brand-neutral SMS copy — iOS rebrand JS rewrites the app name client-side; SMS body must be neutral.
    const smsBody =
      contactName + ' just set you as a trusted contact on the app. ' +
      "If they ever need help, you'll get an alert like this one with their live location. " +
      '— sent by the app, no action needed.';

    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    let twilioPhone = process.env.TWILIO_PHONE_NUMBER || '';
    if (twilioPhone && !twilioPhone.startsWith('+')) twilioPhone = '+' + twilioPhone;

    if (!twilioSid || !twilioAuth || !twilioPhone) {
      console.error('[onboarding/test-sms] Twilio env vars missing');
      return res.status(500).json({ error: 'SMS service not configured' });
    }

    try {
      const twilio = require('twilio')(twilioSid, twilioAuth);
      await twilio.messages.create({
        body: smsBody,
        from: twilioPhone,
        to: phone,
      });
    } catch (smsErr) {
      console.error('[onboarding/test-sms] Twilio send failed:', smsErr && smsErr.message);
      return res.status(502).json({ error: 'Failed to send test message. Please try again.' });
    }

    // Mark the user so they can never fire this again — abuse / billing safety.
    try {
      await run('UPDATE users SET onboarding_test_sms_sent_at = NOW() WHERE id = $1', [user.id]);
    } catch (e) {
      console.error('[onboarding/test-sms] Failed to set sent_at:', e && e.message);
    }

    return res.status(200).json({ success: true, contactName: contactName });
  } catch (err) {
    console.error('[onboarding/test-sms] error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
