const crypto = require('crypto');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { embedWatermark } = require('../_utils/watermark');
const { moderateImage } = require('../_utils/moderate-image');

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const VALID_CONTEXTS = ['referral', 'avatar', 'post', 'catfish', 'date'];
const PHOTO_EXPIRY_DAYS = 10;

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
    const mediaType = isPNG ? 'image/png' : isJPEG ? 'image/jpeg' : 'image/webp';
    return { buffer, mediaType };
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

    const validated = validateBase64Image(image);
    if (!validated) {
      return res.status(400).json({ error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 5MB' });
    }

    const { buffer: imageBuffer, mediaType } = validated;

    // Step 1: AI content moderation (Claude Vision)
    const base64Only = image.replace(/^data:image\/\w+;base64,/, '');
    const modResult = await moderateImage(base64Only, mediaType);

    if (!modResult.approved) {
      // Log the rejection
      await run(
        `INSERT INTO moderation_logs (user_id, action, reason, category, details, created_at)
         VALUES ($1, 'upload_rejected', $2, $3, $4, NOW())`,
        [user.id, modResult.reason, modResult.category, JSON.stringify(modResult)]
      ).catch(() => {});

      const categoryMessages = {
        nudity: 'nudity or sexual content',
        violence: 'graphic violence',
        doxxing: 'personal identifying information',
        minor: 'content involving minors',
        hate: 'hate symbols or offensive imagery',
        other: 'content that violates our guidelines'
      };
      const reasonText = categoryMessages[modResult.category] || categoryMessages.other;

      return res.status(400).json({
        error: 'Photo rejected',
        message: `This photo can't be posted because it may contain ${reasonText}. Please review our community guidelines.`,
        category: modResult.category
      });
    }

    // Step 2: Embed steganographic watermark with user ID
    const watermarkedBuffer = embedWatermark(imageBuffer, String(user.id));
    const watermarkedBase64 = watermarkedBuffer.toString('base64');

    // Compute watermark hash for tracking
    const watermarkHash = crypto.createHash('sha256').update(watermarkedBase64).digest('hex');

    // Step 3: Set 10-day expiry
    const expiresAt = new Date(Date.now() + PHOTO_EXPIRY_DAYS * 24 * 60 * 60 * 1000);

    // Step 4: Store photo with expiry
    const photo = await getOne(
      `INSERT INTO photos (user_id, image_data, context, context_id, created_at, is_deleted, expires_at, status, moderation_result)
       VALUES ($1, $2, $3, $4, NOW(), false, $5, 'active', $6)
       RETURNING id, user_id, context, context_id, created_at, expires_at`,
      [user.id, watermarkedBase64, context, context_id || null, expiresAt.toISOString(), JSON.stringify(modResult)]
    );

    // Record watermark metadata
    await run(
      `INSERT INTO photo_watermarks (photo_id, user_id, watermark_hash, created_at)
       VALUES ($1, $2, $3, NOW())`,
      [photo.id, user.id, watermarkHash]
    );

    // Log successful moderation
    await run(
      `INSERT INTO moderation_logs (user_id, action, reason, category, details, created_at)
       VALUES ($1, 'upload_approved', $2, 'safe', $3, NOW())`,
      [user.id, modResult.reason || 'Content approved', JSON.stringify({ photo_id: photo.id, moderation: modResult })]
    ).catch(() => {});

    return res.status(201).json({
      success: true,
      photo: {
        id: photo.id,
        url: '/api/photos/' + photo.id,
        context: photo.context,
        context_id: photo.context_id,
        created_at: photo.created_at,
        expires_at: photo.expires_at,
        expires_in_days: PHOTO_EXPIRY_DAYS,
        watermarked: true,
        watermarkHash: watermarkHash.substring(0, 12) + '...',
      },
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    return res.status(500).json({ error: 'Failed to upload photo', details: 'See server logs' });
  }
};
