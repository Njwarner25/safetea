const { run, getOne, getMany } = require('./_utils/db');
const { generateToken, cors } = require('./_utils/auth');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Protect with secret
  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const phone = req.query.phone; // Trusted contact phone number
  if (!phone) {
    return res.status(400).json({ error: 'phone query param required (e.g. ?phone=+16306758076)' });
  }

  const results = [];

  try {
    // Step 1: Create a test user
    const hash = await bcrypt.hash('test123', 10);
    const testUser = await getOne(
      `INSERT INTO users (email, password_hash, display_name, role, city)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING *`,
      ['checkout-test@safetea.app', hash, 'SafeTea Tester', 'member', 'Chicago']
    );
    const token = generateToken(testUser);
    results.push({ step: 'Create test user', status: 'OK', userId: testUser.id });

    // Step 2: Create a date checkout
    const shareCode = Math.random().toString(36).substring(2, 8).toUpperCase();
    const scheduledTime = new Date();
    const estimatedReturn = new Date(Date.now() + 3 * 60 * 60 * 1000); // 3 hours from now

    const checkout = await getOne(
      `INSERT INTO date_checkouts
       (user_id, date_name, date_photo_url, venue_name, venue_address, venue_lat, venue_lng,
        scheduled_time, estimated_return, notes, share_code, status)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, 'checked_out')
       RETURNING *`,
      [
        testUser.id,
        'John Smith',
        null,
        'The Violet Hour',
        '1520 N Damen Ave, Chicago, IL 60622',
        41.9087,
        -87.6776,
        scheduledTime.toISOString(),
        estimatedReturn.toISOString(),
        'Met on Hinge, first date - coffee then dinner',
        shareCode,
      ]
    );
    results.push({ step: 'Create checkout', status: 'OK', checkoutId: checkout.id, shareCode });

    // Step 3: Save trusted contact
    const contact = await getOne(
      `INSERT INTO date_trusted_contacts (checkout_id, contact_name, contact_phone, notified)
       VALUES ($1, $2, $3, false)
       RETURNING *`,
      [checkout.id, 'Nate (Owner)', phone]
    );
    results.push({ step: 'Save trusted contact', status: 'OK', contactId: contact.id, phone });

    // Step 4: Send SMS via Twilio
    const twilioSid = process.env.TWILIO_ACCOUNT_SID;
    const twilioAuth = process.env.TWILIO_AUTH_TOKEN;
    const twilioPhone = process.env.TWILIO_PHONE_NUMBER;

    let smsResult = 'Twilio not configured';
    if (twilioSid && twilioAuth && twilioPhone) {
      try {
        const twilio = require('twilio')(twilioSid, twilioAuth);
        const sms = await twilio.messages.create({
          body: `SafeTea Date Alert\n\n` +
            `SafeTea Tester is going on a date.\n\n` +
            `Meeting: John Smith\n` +
            `Where: The Violet Hour, 1520 N Damen Ave, Chicago, IL 60622\n` +
            `When: ${scheduledTime.toLocaleString('en-US', { timeZone: 'America/Chicago' })}\n` +
            `Expected back: ${estimatedReturn.toLocaleString('en-US', { timeZone: 'America/Chicago' })}\n\n` +
            `Track status: https://getsafetea.app/date-status?code=${shareCode}\n\n` +
            `If they don't check in, you'll be notified.\n\n- SafeTea: Stay Safe`,
          from: twilioPhone,
          to: phone,
        });
        smsResult = `SMS sent! SID: ${sms.sid}`;
        await run('UPDATE date_trusted_contacts SET notified = true WHERE id = $1', [contact.id]);
      } catch (smsErr) {
        smsResult = `SMS failed: ${smsErr.message}`;
      }
    }
    results.push({ step: 'Send SMS', status: smsResult.includes('sent') ? 'OK' : 'WARN', detail: smsResult });

    // Step 5: Verify the status page works
    const statusCheck = await getOne(
      `SELECT dc.*, u.display_name as user_name
       FROM date_checkouts dc
       JOIN users u ON dc.user_id = u.id
       WHERE dc.share_code = $1`,
      [shareCode]
    );
    results.push({
      step: 'Status page query',
      status: statusCheck ? 'OK' : 'FAIL',
      detail: statusCheck ? `Found checkout for ${statusCheck.user_name}, status: ${statusCheck.status}` : 'Not found'
    });

    // Step 6: Test check-in
    const checkin = await getOne(
      `UPDATE date_checkouts
       SET status = 'checked_in', checked_in_at = NOW(), safety_rating = 5, checkin_notes = 'Great date!'
       WHERE id = $1
       RETURNING *`,
      [checkout.id]
    );
    results.push({
      step: 'Check-in',
      status: checkin.status === 'checked_in' ? 'OK' : 'FAIL',
      detail: `Status: ${checkin.status}, Checked in at: ${checkin.checked_in_at}`
    });

    // Send check-in SMS
    if (twilioSid && twilioAuth && twilioPhone) {
      try {
        const twilio = require('twilio')(twilioSid, twilioAuth);
        await twilio.messages.create({
          body: `SafeTea Update: SafeTea Tester has checked in safely from their date with John Smith. ✅\n\nThey made it home safe.`,
          from: twilioPhone,
          to: phone,
        });
        results.push({ step: 'Check-in SMS', status: 'OK', detail: 'Safe check-in notification sent' });
      } catch (e) {
        results.push({ step: 'Check-in SMS', status: 'WARN', detail: e.message });
      }
    }

    // Cleanup
    await run('DELETE FROM date_trusted_contacts WHERE checkout_id = $1', [checkout.id]);
    await run('DELETE FROM date_checkouts WHERE id = $1', [checkout.id]);
    await run('DELETE FROM users WHERE id = $1', [testUser.id]);
    results.push({ step: 'Cleanup', status: 'OK', detail: 'Test data removed' });

    const allOk = results.every(r => r.status === 'OK');
    return res.status(200).json({
      summary: `${results.filter(r => r.status === 'OK').length}/${results.length} steps passed`,
      allPassed: allOk,
      shareUrl: `https://getsafetea.app/date-status?code=${shareCode}`,
      results,
    });
  } catch (err) {
    // Cleanup on error
    try {
      await run("DELETE FROM users WHERE email = 'checkout-test@safetea.app'");
    } catch (e) {}
    return res.status(500).json({ error: err.message, results });
  }
};
