const { getOne, getMany, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { extractWatermark } = require('../_utils/watermark');

const VALID_REASONS = ['no_consent', 'personal_info', 'shared_externally', 'other'];

function validateBase64Image(base64Str) {
  try {
    const base64Only = base64Str.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(base64Only)) return null;
    const buffer = Buffer.from(base64Only, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return null; // 10MB max
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49;
    if (!isPNG && !isJPEG && !isWebP) return null;
    return { buffer, base64: base64Only };
  } catch (e) { return null; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Authenticate the user
    const user = await authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // ─── POST: Create a removal request ───────────────────────────────
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const { image, photo_id, reason, additional_context } = body;

      // Validate reason
      if (!reason || !VALID_REASONS.includes(reason)) {
        return res.status(400).json({
          error: 'reason is required. Must be one of: ' + VALID_REASONS.join(', ')
        });
      }

      // Must provide either an uploaded image or an existing photo_id
      if (!image && !photo_id) {
        return res.status(400).json({
          error: 'Either image (base64) or photo_id is required'
        });
      }

      let imageBuffer = null;
      let imageBase64 = null;
      let watermarkResult = { found: false };

      // ── Path A: User uploads a photo directly ──
      if (image) {
        const validated = validateBase64Image(image);
        if (!validated) {
          return res.status(400).json({
            error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 10MB'
          });
        }
        imageBuffer = validated.buffer;
        imageBase64 = validated.base64;

        // Try to extract watermark from the uploaded photo
        watermarkResult = extractWatermark(imageBuffer);
      }

      // ── Path B: User references an existing photo by ID ──
      if (photo_id && !image) {
        const photo = await getOne(
          'SELECT id, image_data, user_id FROM photos WHERE id = $1 AND is_deleted = false',
          [photo_id]
        );
        if (!photo) {
          return res.status(404).json({ error: 'Photo not found' });
        }
        imageBuffer = Buffer.from(photo.image_data, 'base64');
        imageBase64 = photo.image_data;
        watermarkResult = extractWatermark(imageBuffer);
      }

      // Determine the original uploader from watermark
      const watermarkDetected = watermarkResult.found && watermarkResult.verified;
      const watermarkUploaderId = watermarkDetected ? watermarkResult.userId : null;

      // Store the removal request
      const result = await run(
        `INSERT INTO photo_removal_requests
         (requester_id, photo_id, uploaded_photo_data, reason, additional_context,
          watermark_detected, watermark_uploader_id, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'pending', NOW())
         RETURNING id, status, watermark_detected, created_at`,
        [
          user.id,
          photo_id || null,
          imageBase64,
          reason,
          additional_context || null,
          watermarkDetected,
          watermarkUploaderId
        ]
      );

      const request = result.rows[0];

      // If watermark identified an uploader, auto-flag their account for review
      if (watermarkDetected && watermarkUploaderId) {
        // Record a pending strike (not applied until moderator approves)
        await run(
          `INSERT INTO user_strikes (user_id, reason, removal_request_id, status, created_at)
           VALUES ($1, $2, $3, 'pending', NOW())
           ON CONFLICT DO NOTHING`,
          [watermarkUploaderId, 'photo_removal_request', request.id]
        ).catch(err => {
          console.error('Failed to create pending strike (non-blocking):', err);
        });
      }

      return res.status(201).json({
        success: true,
        request_id: request.id,
        watermark_detected: watermarkDetected,
        watermark_note: watermarkDetected
          ? 'Watermark found — original uploader identified. Your request will be fast-tracked.'
          : 'No watermark detected. Your request will be reviewed manually (may take longer).',
        status: 'pending',
        message: 'Your photo removal request has been received. We will review it within 24 hours.'
      });
    }

    // ─── GET: Check status of user's removal requests ─────────────────
    if (req.method === 'GET') {
      const requests = await getMany(
        `SELECT id, photo_id, reason, additional_context, watermark_detected,
                status, reviewer_notes, created_at, reviewed_at, resolved_at
         FROM photo_removal_requests
         WHERE requester_id = $1
         ORDER BY created_at DESC
         LIMIT 50`,
        [user.id]
      );

      return res.status(200).json({
        success: true,
        requests: requests || []
      });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Photo removal request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
