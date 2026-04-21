/**
 * SafeTea Safety Vault — envelope encryption service (V1)
 *
 * Model:
 *   - KEK (Key Encryption Key): 32-byte AES-256 key, lives in env var VAULT_KEK
 *     as base64. Never written to DB, never logged.
 *   - DEK (Data Encryption Key): random 32-byte key per folder. Stored in the
 *     folder row as `dek_wrapped` (+ `dek_iv`, `dek_tag`) — AES-256-GCM wrapped
 *     with the KEK. Unwrapped into memory only for read/write.
 *   - Content encryption: each encrypted blob uses AES-256-GCM with a unique
 *     12-byte random IV. Output is `iv || tag || ciphertext`, base64-encoded,
 *     written to the content column.
 *
 * Design rules:
 *   - Never accept or return plaintext keys from public API. Keep all key
 *     material confined to this module.
 *   - Fail closed: if VAULT_KEK is missing, every call throws instead of
 *     silently falling through to an unencrypted write.
 *   - Rotation path: a separate `rotateKEK(oldKek, newKek)` utility (future
 *     work) iterates folders, unwraps DEK with old KEK, re-wraps with new
 *     KEK. Data blobs are untouched.
 *
 * V1 limits — intentional simplifications to ship faster. Each is tracked in
 *   2-product/specs/safety-vault.md for the V2 migration:
 *   - KEK in env var (vs. managed KMS)
 *   - Single DEK per folder (vs. per-entry DEK)
 *   - No key versioning column — rotation requires a single-shot migration
 */

'use strict';

const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const KEY_LEN = 32;   // AES-256
const IV_LEN = 12;    // GCM recommended IV length
const TAG_LEN = 16;   // GCM auth tag length

/**
 * Load KEK from env. Throws if unset or malformed so callers fail closed
 * instead of accidentally writing plaintext.
 */
function getKEK() {
  const raw = process.env.VAULT_KEK;
  if (!raw) {
    throw new Error('VAULT_KEK not configured. Vault operations disabled.');
  }
  const buf = Buffer.from(raw, 'base64');
  if (buf.length !== KEY_LEN) {
    throw new Error(`VAULT_KEK must decode to exactly ${KEY_LEN} bytes (AES-256). Got ${buf.length}.`);
  }
  return buf;
}

/**
 * Generate a fresh DEK for a new folder. Returns the wrapped form ready to
 * persist in the folder row.
 *
 * @returns {{ dek_wrapped: string, dek_iv: string, dek_tag: string }} base64 fields
 */
function createFolderKey() {
  const kek = getKEK();
  const dek = crypto.randomBytes(KEY_LEN);
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, kek, iv);
  const wrapped = Buffer.concat([cipher.update(dek), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    dek_wrapped: wrapped.toString('base64'),
    dek_iv: iv.toString('base64'),
    dek_tag: tag.toString('base64'),
  };
}

/**
 * Unwrap a stored folder DEK back to plaintext bytes (in memory only).
 * Caller should keep the returned buffer tight-scoped.
 */
function unwrapFolderKey(wrappedRow) {
  const kek = getKEK();
  const wrapped = Buffer.from(wrappedRow.dek_wrapped, 'base64');
  const iv = Buffer.from(wrappedRow.dek_iv, 'base64');
  const tag = Buffer.from(wrappedRow.dek_tag, 'base64');
  const decipher = crypto.createDecipheriv(ALGO, kek, iv);
  decipher.setAuthTag(tag);
  const dek = Buffer.concat([decipher.update(wrapped), decipher.final()]);
  if (dek.length !== KEY_LEN) {
    throw new Error('Unwrapped DEK has wrong length. KEK mismatch or row corrupted.');
  }
  return dek;
}

/**
 * Encrypt a plaintext string with a folder DEK (already unwrapped).
 * Returns a single base64 string containing [iv || tag || ciphertext].
 * Store that string in the encrypted_* column.
 *
 * @param {Buffer} dek 32-byte unwrapped DEK
 * @param {string} plaintext UTF-8 string
 * @returns {string} base64 blob (safe to store / index on)
 */
function encryptField(dek, plaintext) {
  if (plaintext == null) return null;
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LEN) {
    throw new Error('encryptField: dek must be a 32-byte Buffer');
  }
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv(ALGO, dek, iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, ct]).toString('base64');
}

/**
 * Decrypt a base64 blob written by encryptField. Returns the UTF-8 string.
 * Throws if the auth tag doesn't verify — callers should treat this as a
 * tamper / corruption signal and NOT silently use the malformed content.
 */
function decryptField(dek, blob) {
  if (blob == null) return null;
  if (!Buffer.isBuffer(dek) || dek.length !== KEY_LEN) {
    throw new Error('decryptField: dek must be a 32-byte Buffer');
  }
  const buf = Buffer.from(blob, 'base64');
  if (buf.length < IV_LEN + TAG_LEN + 1) {
    throw new Error('decryptField: blob too short to be valid ciphertext');
  }
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const ct = buf.subarray(IV_LEN + TAG_LEN);
  const decipher = crypto.createDecipheriv(ALGO, dek, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(ct), decipher.final()]);
  return pt.toString('utf8');
}

/**
 * SHA-256 hex checksum for uploaded files. Used in vault_files.checksum for
 * integrity verification and break-glass audit.
 */
function fileChecksum(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

/**
 * Utility: generate a KEK-ready base64 string for bootstrapping. Not called
 * in production code — run manually once, set the output as VAULT_KEK env.
 *
 *   node -e "console.log(require('./services/vault/encryption').generateKEK())"
 */
function generateKEK() {
  return crypto.randomBytes(KEY_LEN).toString('base64');
}

module.exports = {
  createFolderKey,
  unwrapFolderKey,
  encryptField,
  decryptField,
  fileChecksum,
  generateKEK,
  // exposed for tests only
  _constants: { ALGO, KEY_LEN, IV_LEN, TAG_LEN },
};
