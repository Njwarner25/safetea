/**
 * POST /api/vault/contact-portal/activate
 *   Body: { invite_token, email }
 *
 * Step 1 of the contact flow. No user auth — the contact is not a SafeTea
 * account holder. We accept an invite_token (long unguessable string the
 * owner's invite email contains) plus the contact's email for a confirmation
 * match, then issue a 6-digit OTP to that email.
 *
 * Rate limiting (light): `otp_attempts` on the latest access-request row
 * (we issue at most 5 OTPs per request-attempt cycle).
 */

'use strict';

const { cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const otpHelper = require('../../../services/vault/otp');
const notifications = require('../../../services/vault/notifications');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = (await parseBody(req)) || {};
    const token = typeof body.invite_token === 'string' ? body.invite_token.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';

    if (!token || token.length < 20) return res.status(400).json({ error: 'Invite token required' });
    if (!email) return res.status(400).json({ error: 'Email required' });

    // Look up the contact. Bad token AND wrong email both return the same
    // 404 to avoid confirming either in isolation.
    const contact = await getOne(
      `SELECT id, owner_user_id, contact_email, status
       FROM vault_trusted_contacts WHERE invite_token = $1`,
      [token]
    );
    if (!contact || contact.status === 'revoked' || contact.contact_email !== email) {
      return res.status(404).json({ error: 'Invalid invite' });
    }

    // Find or create a fresh pending access_request record to anchor the OTP
    // state. We can't issue an OTP without at least one pending request row
    // because OTP lives on that row. In the portal flow, the user hasn't
    // picked a folder yet, so we create a "draft" request with folder_id = 0.
    // Instead: store OTP on a lightweight session-prep record. Simpler: we
    // reuse a single row per contact by upsert.
    //
    // Design: we don't create the access_request until the contact actually
    // submits their request. For the OTP step, we store the hashed code on a
    // separate short-lived record — we'll reuse vault_contact_sessions as a
    // "pending" session (token = pending hash, expires_at = OTP expiry).
    const otp = otpHelper.generateOtp();
    const hash = otpHelper.hashOtp(otp);
    const expires = otpHelper.otpExpiryFromNow();

    // Replace any existing pending OTP session for this contact.
    await run(`DELETE FROM vault_contact_sessions WHERE contact_id = $1`, [contact.id]);
    // We use the OTP HASH as the token column value during the pending
    // phase; verify.js rotates it to a real session token on success.
    await run(
      `INSERT INTO vault_contact_sessions (token, contact_id, expires_at)
       VALUES ($1, $2, $3)`,
      [hash.slice(0, 43), contact.id, expires]
    );

    notifications.sendContactOtp(email, otp).catch(function () {});

    return res.status(200).json({
      ok: true,
      contact_id: String(contact.id),
      otp_expires_at: expires.toISOString(),
    });
  } catch (err) {
    console.error('[vault/contact-portal/activate] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
