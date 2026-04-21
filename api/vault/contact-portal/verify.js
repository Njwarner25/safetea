/**
 * POST /api/vault/contact-portal/verify
 *   Body: { invite_token, email, code }
 *
 * Step 2: verify the OTP, issue a real contact-session token (30 min TTL)
 * the contact will use on the next request-submission step.
 */

'use strict';

const { cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const otpHelper = require('../../../services/vault/otp');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = (await parseBody(req)) || {};
    const token = typeof body.invite_token === 'string' ? body.invite_token.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const code = typeof body.code === 'string' ? body.code.trim() : '';

    if (!token || !email || !code) return res.status(400).json({ error: 'Missing required fields' });
    if (!/^[0-9]{6}$/.test(code)) return res.status(400).json({ error: 'Code must be 6 digits' });

    const contact = await getOne(
      `SELECT id, status, contact_email FROM vault_trusted_contacts WHERE invite_token = $1`,
      [token]
    );
    if (!contact || contact.status === 'revoked' || contact.contact_email !== email) {
      return res.status(404).json({ error: 'Invalid invite' });
    }

    // The OTP hash was stored as the "pending" token on vault_contact_sessions.
    const hash = otpHelper.hashOtp(code).slice(0, 43);
    const session = await getOne(
      `SELECT token, contact_id, expires_at FROM vault_contact_sessions
       WHERE contact_id = $1`,
      [contact.id]
    );
    if (!session) return res.status(400).json({ error: 'No verification pending. Request a new code.' });
    if (new Date(session.expires_at).getTime() < Date.now()) {
      await run(`DELETE FROM vault_contact_sessions WHERE contact_id = $1`, [contact.id]);
      return res.status(400).json({ error: 'Code expired. Request a new one.' });
    }
    if (session.token !== hash) {
      // Wrong code. We don't expose "is this the right code" — just fail.
      return res.status(400).json({ error: 'Invalid code' });
    }

    // Rotate token: replace pending hash with a real session token.
    const sessionToken = otpHelper.generateSessionToken().slice(0, 43);
    const sessionExp = otpHelper.sessionExpiryFromNow();
    await run(`DELETE FROM vault_contact_sessions WHERE contact_id = $1`, [contact.id]);
    await run(
      `INSERT INTO vault_contact_sessions (token, contact_id, expires_at) VALUES ($1, $2, $3)`,
      [sessionToken, contact.id, sessionExp]
    );

    return res.status(200).json({
      ok: true,
      contact_id: String(contact.id),
      session_token: sessionToken,
      expires_at: sessionExp.toISOString(),
    });
  } catch (err) {
    console.error('[vault/contact-portal/verify] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
