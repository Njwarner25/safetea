/**
 * Client fingerprinting helpers — IP + user-agent extraction and hashing.
 * Used by auth handlers (register, login) and the admin ban endpoints.
 */

'use strict';

const crypto = require('crypto');

/**
 * Return the best guess at the caller's public IP. Vercel sets
 * x-forwarded-for (may contain a chain) and x-vercel-forwarded-for
 * (single IP). Fall back to req.socket for local/non-Vercel.
 */
function getClientIp(req) {
  if (!req || !req.headers) return null;
  const chain = req.headers['x-vercel-forwarded-for']
    || req.headers['x-real-ip']
    || req.headers['x-forwarded-for']
    || '';
  if (chain) {
    const first = String(chain).split(',')[0].trim();
    if (first) return first;
  }
  const sock = req.socket || req.connection;
  return (sock && sock.remoteAddress) || null;
}

function getUserAgent(req) {
  if (!req || !req.headers) return null;
  const ua = req.headers['user-agent'];
  return ua ? String(ua).slice(0, 500) : null;
}

/**
 * Stable device hash: sha256 of UA + accept-language. Good enough to
 * cluster the same browser across multiple signups without being a
 * hardware-level fingerprint (which the web can't honestly provide).
 */
function getDeviceHash(req) {
  const ua = getUserAgent(req) || '';
  const lang = (req && req.headers && req.headers['accept-language']) || '';
  if (!ua && !lang) return null;
  return crypto.createHash('sha256').update(ua + '|' + lang).digest('hex');
}

module.exports = { getClientIp, getUserAgent, getDeviceHash };
