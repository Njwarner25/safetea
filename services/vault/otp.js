/**
 * OTP + contact-session helpers for the Safety Vault contact portal.
 *
 * OTPs: 6-digit numeric codes, hashed with SHA-256 before storage.
 *       Never write the plaintext code to the DB or logs.
 *
 * Session tokens: 32 bytes of crypto randomness, url-safe base64 (44 chars
 *                 with = padding stripped = 43 char token). Stored raw
 *                 in vault_contact_sessions (short TTL).
 *
 * Note: contacts are not SafeTea account holders — this is a separate auth
 * path from the JWT bearer tokens used for user sessions. The bearer token
 * returned here is opaque and only authenticates the contact-portal
 * endpoints.
 */

'use strict';

const crypto = require('crypto');

const OTP_TTL_MS = 10 * 60 * 1000;           // 10 minutes
const SESSION_TTL_MS = 30 * 60 * 1000;       // 30 minutes
const OTP_LENGTH = 6;
const MAX_OTP_ATTEMPTS = 5;

function generateOtp() {
  // Zero-padded decimal. Using randomInt to avoid modulo bias in randomBytes.
  const n = crypto.randomInt(0, Math.pow(10, OTP_LENGTH));
  return String(n).padStart(OTP_LENGTH, '0');
}

function hashOtp(code) {
  return crypto.createHash('sha256').update(String(code)).digest('hex');
}

function generateSessionToken() {
  // 32 bytes = 256 bits of entropy. base64url and drop padding.
  return crypto.randomBytes(32).toString('base64url');
}

function now() { return new Date(); }
function otpExpiryFromNow() { return new Date(Date.now() + OTP_TTL_MS); }
function sessionExpiryFromNow() { return new Date(Date.now() + SESSION_TTL_MS); }

module.exports = {
  OTP_TTL_MS,
  SESSION_TTL_MS,
  MAX_OTP_ATTEMPTS,
  generateOtp,
  hashOtp,
  generateSessionToken,
  otpExpiryFromNow,
  sessionExpiryFromNow,
  now,
};
