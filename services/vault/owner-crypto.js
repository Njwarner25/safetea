/**
 * Owner-scoped field encryption.
 *
 * Used for rows that don't belong to a folder (vault_trusted_contacts and
 * friends) so we can't use a folder DEK. Instead we derive a
 * deterministic per-owner key from VAULT_KEK, giving each owner
 * independent blast-radius: dumping another owner's rows does not
 * decrypt this owner's contacts.
 *
 * Not for content that will ever be shared with a non-owner. That
 * material must use a folder DEK so sharing = unwrap + re-encrypt under
 * a share key.
 */

'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

function kek() {
  const raw = process.env.VAULT_KEK;
  if (!raw) throw new Error('VAULT_KEK not configured');
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== 32) throw new Error('VAULT_KEK must decode to 32 bytes');
  return buf;
}

function deriveOwnerKey(userId) {
  return crypto.createHmac('sha256', kek()).update('vault-owner|' + String(userId)).digest();
}

function encryptForOwner(userId, plaintext) {
  if (plaintext == null) return null;
  const key = deriveOwnerKey(userId);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, key, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

function decryptForOwner(userId, blob) {
  if (!blob) return null;
  try {
    const key = deriveOwnerKey(userId);
    const buf = Buffer.from(blob, 'base64');
    if (buf.length < IV_LEN + TAG_LEN + 1) return null;
    const iv = buf.subarray(0, IV_LEN);
    const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
    const ct = buf.subarray(IV_LEN + TAG_LEN);
    const decipher = crypto.createDecipheriv(ALGO, key, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
  } catch (_) {
    return null;
  }
}

module.exports = { encryptForOwner, decryptForOwner };
