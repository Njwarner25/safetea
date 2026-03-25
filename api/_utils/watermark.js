const crypto = require('crypto');

const WATERMARK_SECRET = process.env.WATERMARK_SECRET || 'safetea-watermark-dev-secret';
const MAGIC_HEADER = Buffer.from('STEA', 'ascii');
const SAFE_OFFSET = 256;

function generateWatermarkPayload(userId) {
  const timestamp = Date.now().toString();
  const data = `${userId}|${timestamp}`;
  const checksum = crypto
    .createHmac('sha256', WATERMARK_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16);
  return `${data}|${checksum}`;
}

function verifyWatermarkPayload(payload) {
  const parts = payload.split('|');
  if (parts.length !== 3) return false;
  const data = `${parts[0]}|${parts[1]}`;
  const expected = crypto
    .createHmac('sha256', WATERMARK_SECRET)
    .update(data)
    .digest('hex')
    .substring(0, 16);
  return parts[2] === expected;
}

function encodePayloadLSB(buffer, payload) {
  const result = Buffer.from(buffer);
  const payloadBuffer = Buffer.from(payload, 'utf8');
  const payloadLength = payloadBuffer.length;
  let byteIndex = SAFE_OFFSET + MAGIC_HEADER.length;

  const lengthBytes = Buffer.allocUnsafe(2);
  lengthBytes.writeUInt16BE(payloadLength, 0);

  for (let i = 0; i < 2; i++) {
    const byte = lengthBytes[i];
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= result.length) return result;
      result[byteIndex] = (result[byteIndex] & 0xFE) | ((byte >> bit) & 1);
      byteIndex++;
    }
  }
  for (let i = 0; i < payloadLength; i++) {
    const byte = payloadBuffer[i];
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= result.length) return result;
      result[byteIndex] = (result[byteIndex] & 0xFE) | ((byte >> bit) & 1);
      byteIndex++;
    }
  }
  return result;
}

function decodePayloadLSB(buffer) {
  let byteIndex = SAFE_OFFSET + MAGIC_HEADER.length;
  const lengthBytes = Buffer.allocUnsafe(2);
  for (let i = 0; i < 2; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= buffer.length) return null;
      byte = (byte << 1) | (buffer[byteIndex] & 1);
      byteIndex++;
    }
    lengthBytes[i] = byte;
  }
  const payloadLength = lengthBytes.readUInt16BE(0);
  if (payloadLength === 0 || payloadLength > 1024) return null;

  const payloadBytes = Buffer.allocUnsafe(payloadLength);
  for (let i = 0; i < payloadLength; i++) {
    let byte = 0;
    for (let bit = 7; bit >= 0; bit--) {
      if (byteIndex >= buffer.length) return null;
      byte = (byte << 1) | (buffer[byteIndex] & 1);
      byteIndex++;
    }
    payloadBytes[i] = byte;
  }
  try { return payloadBytes.toString('utf8'); } catch (e) { return null; }
}

function embedWatermark(imageBuffer, userId) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < SAFE_OFFSET + 256) {
    throw new Error('Invalid image buffer');
  }
  const result = Buffer.from(imageBuffer);
  MAGIC_HEADER.copy(result, SAFE_OFFSET);
  const payload = generateWatermarkPayload(userId);
  return encodePayloadLSB(result, payload);
}

function extractWatermark(imageBuffer) {
  if (!Buffer.isBuffer(imageBuffer) || imageBuffer.length < SAFE_OFFSET + MAGIC_HEADER.length) {
    return { found: false };
  }
  if (!MAGIC_HEADER.equals(imageBuffer.slice(SAFE_OFFSET, SAFE_OFFSET + MAGIC_HEADER.length))) {
    return { found: false };
  }
  const payload = decodePayloadLSB(imageBuffer);
  if (!payload) return { found: false };
  const parts = payload.split('|');
  if (parts.length !== 3) return { found: false };
  return {
    found: true,
    userId: parts[0],
    timestamp: parts[1],
    verified: verifyWatermarkPayload(payload)
  };
}

module.exports = { embedWatermark, extractWatermark };
