const crypto = require('crypto');

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const TAG_LENGTH = 16;

// Derive a 32-byte key from the secret
function getKey() {
  const secret = process.env.PII_ENCRYPTION_KEY || process.env.JWT_SECRET;
  if (!secret) throw new Error('No encryption key configured');
  return crypto.createHash('sha256').update(secret).digest();
}

/**
 * Encrypt a plaintext string. Returns hex-encoded ciphertext.
 * Format: iv:tag:ciphertext (all hex)
 */
function encrypt(plaintext) {
  if (!plaintext) return plaintext;
  const key = getKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  let encrypted = cipher.update(plaintext, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted;
}

/**
 * Decrypt a hex-encoded ciphertext back to plaintext.
 */
function decrypt(ciphertext) {
  if (!ciphertext) return ciphertext;
  // If it doesn't look encrypted (no colons), return as-is (legacy plaintext data)
  if (!ciphertext.includes(':')) return ciphertext;
  try {
    const key = getKey();
    const parts = ciphertext.split(':');
    if (parts.length !== 3) return ciphertext; // Not encrypted format
    const iv = Buffer.from(parts[0], 'hex');
    const tag = Buffer.from(parts[1], 'hex');
    const encrypted = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    // If decryption fails, data is likely plaintext (pre-encryption)
    return ciphertext;
  }
}

/**
 * Hash a value for lookups (email/phone search).
 * Deterministic — same input always produces same hash.
 */
function hashForLookup(value) {
  if (!value) return value;
  const secret = process.env.PII_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', secret).update(value.toLowerCase().trim()).digest('hex');
}

module.exports = { encrypt, decrypt, hashForLookup };
