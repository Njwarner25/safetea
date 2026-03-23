const crypto = require('crypto');

const WATERMARK_SECRET = process.env.WATERMARK_SECRET || 'safetea-watermark-dev-secret';
const MAGIC_HEADER = Buffer.from('STEA', 'ascii'); // 53 54 45 41 in hex
const SAFE_OFFSET = 256; // Skip first 256 bytes to avoid header collision

/**
 * Generate a watermark payload: userId|timestamp|checksum
 * @param {string} userId - The user ID to embed
 * @returns {string} payload string
 */
function generateWatermarkPayload(userId) {
  const timestamp = Date.now().toString();
  const data = `${userId}|${timestamp}`;

  // Generate HMAC-SHA256 checksum
  const checksum = crypto
    .createHmac('sha256', WATERMARK_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16); // Use first 16 chars of hex hash

  return `${data}|${checksum}`;
}

/**
 * Verify a watermark payload checksum
 * @param {string} payload - The extracted payload
 * @returns {boolean} True if checksum is valid
 */
function verifyWatermarkPayload(payload) {
  const parts = payload.split('|');
  if (parts.length !== 3) return false;

  const userId = parts[0];
  const timestamp = parts[1];
  const checksum = parts[2];

  const data = `${userId}|${timestamp}`;
  const expectedChecksum = crypto
    .createHmac('sha256', WATERMARK_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16);

  return checksum === expectedChecksum;
}

/**
 * Encode payload into LSB of buffer data
 * @param {Buffer} buffer - Image buffer
 * @param {string} payload - Payload to embed
 * @returns {Buffer} Modified buffer
 */
function encodePayloadLSB(buffer, payload) {
  const result = Buffer.from(buffer);
  const payloadBuffer = Buffer.from(payload, 'utf8');
  const payloadLength = payloadBuffer.length;

  let bitIndex = 0;
  let byteIndex = SAFE_OFFSET + MAGIC_HEADER.length;

  // Encode payload length (16-bit big endian)
  const lengthBytes = Buffer.allocUnsafe(2);
  lengthBytes.writeUInt16BE(payloadLength, 0);

  // Encode length
  for (let i = 0; i < 2; i++) {
    const byte = lengthBytes[i];
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= result.length) return result;
      const bitValue = (byte >> bit) & 1;
      result[byteIndex] = (result[byteIndex] & 0xFE) | bitValue;
      byteIndex++;
    }
  }

  // Encode payload
  for (let i = 0; i < payloadLength; i++) {
    const byte = payloadBuffer[i];
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= result.length) return result;
      const bitValue = (byte >> bit) & 1;
      result[byteIndex] = (result[byteIndex] & 0xFE) | bitValue;
      byteIndex++;
    }
  }

  return result;
}

/**
 * Decode payload from LSB of buffer data
 * @param {Buffer} buffer - Image buffer
 * @returns {string|null} Decoded payload or null
 */
function decodePayloadLSB(buffer) {
  let byteIndex = SAFE_OFFSET + MAGIC_HEADER.length;

  // Decode length (16-bit big endian)
  const lengthBytes = Buffer.allocUnsafe(2);
  for (let i = 0; i < 2; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= buffer.length) return null;
      const bitValue = buffer[byteIndex] & 1;
      byte = (byte << 1) | bitValue;
      byteIndex++;
    }
    lengthBytes[i] = byte;
  }

  const payloadLength = lengthBytes.readUInt16BE(0);
  if (payloadLength === 0 || payloadLength > 1024) return null; // Sanity check

  // Decode payload
  const payloadBytes = Buffer.allocUnsafe(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= buffer.length) return null;
      const bitValue = buffer[byteIndex] & 1;
      byte = (byte << 1) | bitValue;
      byteIndex++;
    }
    payloadBytes[i] = byte;
  }

  try {
    return payloadBytes.toString('utf8');
  } catch (err) {
    return null;
  }
}

/**
 * Embed a watermark into an image buffer
 * @param {Buffer} imageBuffer - Raw image data
 * @param {string} userId - User ID to watermark
 * @returns {Buffer} Watermarked image buffer
 */
function embedWatermark(imageBuffer, userId) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < SAFE_OFFSET + 256) {
    throw new Error('Invalid image buffer');
  }

  const result = Buffer.from(imageBuffer);

  // Write magic header
  MAGIC_HEADER.copy(result, SAFE_OFFSET);

  // Generate and encode payload
  const payload = generateWatermarkPayload(userId);
  encodePayloadLSB(result, payload);

  return result;
}

/**
 * Extract and verify a watermark from an image buffer
 * @param {Buffer} imageBuffer - Raw image data
 * @returns {object} { found: boolean, userId?: string, timestamp?: string, verified?: boolean }
 */
function extractWatermark(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < SAFE_OFFSET + MAGIC_HEADER.length) {
    return { found: false };
  }

  // Check for magic header
  const headerMatch = MAGIC_HEADER.equals(
    imageBuffer.slice(SAFE_OFFSET, SAFE_OFFSET + MAGIC_HEADER.length)
  );

  if (!headerMatch) {
    return { found: false };
  }

  // Decode payload
  const payload = decodePayloadLSB(imageBuffer);
  if (!payload) {
    return { found: false };
  }

  // Parse payload
  const parts = payload.split('|');
  if (parts.length !== 3) {
    return { found: false };
  }

  const userId = parts[0];
  const timestamp = parts[1];
  const verified = verifyWatermarkPayload(payload);

  return {
    found: true,
    userId,
    timestamp,
    verified
  };
}

module.exports = {
  embedWatermark,
  extractWatermark,
  generateWatermarkPayload,
  verifyWatermarkPayload
};
