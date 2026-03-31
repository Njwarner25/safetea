const crypto = require('crypto');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { embedWatermark } = require('../_utils/watermark');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_CONTEXTS = ['referral', 'avatar', 'post', 'catfish', 'date'];

function validateBase64Image(base64Str) {
  try {
    const base64Only = base64Str.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(base64Only)) return null;
    const buffer = Buffer.from(base64Only, 'base64');
    if (buffer.length > MAX_IMAGE_SIZE) return null;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49;
    if (!isPNG && !isJPEG && !isWebP) return null;
    return buffer;
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const body = await parseBody(req);
    const { image, context, context_id } = body;

    if (!image) return res.status(400).json({ error: 'image (base64) is required' });
    if (!context || !VALID_CONTEXTS.includes(context)) {
      return res.status(400).json({ error: 'context must be one of: ' + VALID_CONTEXTS.join(', ') });
    }

    const imageBuffer = validateBase64Image(image);
    if (!imageBuffer) {
      return res.status(400).json({ error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 5MB' });
    }

    // Embed watermark with user ID
    const watermarkedBuffer = embedWatermark(imageBuffer, String(user.id));
    const watermarkedBase64 = watermarkedBuffer.toString('base64');

    // Compute watermark hash for tracking
    const watermarkHash = crypto.createHash('sha256').update(watermarkedBase64).digest('hex');

    // Store photo (using image_data column)
    const photo = await getOne(
      `INSERT INTO photos (user_id, image_data, context, context_id, created_at, is_deleted)
       VALUES ($1, $2, $3, $4, NOW(), false)
       RETURNING id, user_id, context, context_id, created_at`,
      [user.id, watermarkedBase64, context, context_id || null]
    );

    // Record watermark metadata
    await run(
      `INSERT INTO photo_watermarks (photo_id, user_id, watermark_hash, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [photo.id, user.id, watermarkHash]
    );

    return res.status(201).json({
      success: true,
      photo: {
        id: photo.id,
        url: '/api/photos/' + photo.id,
        context: photo.context,
        context_id: photo.context_id,
        created_at: photo.created_at,
        watermarked: true,
        watermarkHash: watermarkHash.substring(0, 12) + '...',
      },
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({ error: 'Failed to upload photo', details: 'See server logs' });
  }
};
