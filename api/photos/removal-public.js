const { parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const crypto = require('crypto');
const { extractWatermark } = require('../_utils/watermark');

function validateBase64Image(base64Str) {
  try {
    const base64Only = base64Str.replace(/^data:image\/\w+;base64,/, '');
    if (!/^[A-Za-z0-9+/=]*$/.test(base64Only)) return null;
    const buffer = Buffer.from(base64Only, 'base64');
    if (buffer.length > 10 * 1024 * 1024) return null;
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49;
    if (!isPNG && !isJPEG && !isWebP) return null;
    return { buffer, base64: base64Only };
  } catch (e) { return null; }
}

function validateEmail(email) {
  if (!email || typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 255;
}

module.exports = async function handler(req, res) {
  // Public endpoint — open CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = await parseBody(req);

    const { image, email, details, decoded_viewer_id, decode_confidence } = body;

    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }

    if (email && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    const validated = validateBase64Image(image);
    if (!validated) {
      return res.status(400).json({
        error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 10MB'
      });
    }

    const imageBuffer = validated.buffer;
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').substring(0, 64);

    // Extract watermark — try server-side LSB first, fall back to client-decoded luminance
    let watermarkVerified = false;
    let watermarkUserId = null;
    try {
      const watermarkResult = extractWatermark(imageBuffer);
      watermarkVerified = watermarkResult.found && watermarkResult.verified;
      watermarkUserId = watermarkVerified ? watermarkResult.userId : null;
    } catch (e) {
      console.error('LSB watermark extraction error (non-fatal):', e.message);
    }

    // Fall back to client-side luminance watermark if LSB not found
    if (!watermarkVerified && decoded_viewer_id && parseInt(decoded_viewer_id) > 0) {
      const confidence = parseInt(decode_confidence) || 0;
      if (confidence >= 30) {
        // Verify the user exists before trusting client-decoded ID
        const decodedUser = await getOne('SELECT id FROM users WHERE id = $1', [parseInt(decoded_viewer_id)]);
        if (decodedUser) {
          watermarkVerified = true;
          watermarkUserId = String(decodedUser.id);
        }
      }
    }

    let autoActionTaken = null;

    if (watermarkVerified && watermarkUserId) {
      const leaker = await getOne('SELECT id, display_name, banned FROM users WHERE id = $1', [parseInt(watermarkUserId, 10)]);

      if (leaker && !leaker.banned) {
        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent' WHERE id = $2`,
          ['Photo leaked outside SafeTea (watermark verified)', parseInt(watermarkUserId, 10)]
        );
        await run('UPDATE posts SET hidden = true WHERE user_id = $1', [parseInt(watermarkUserId, 10)]);
        autoActionTaken = 'account_banned_posts_hidden';
      } else if (leaker && leaker.banned) {
        autoActionTaken = 'already_banned';
      }
    }

    // Create removal request record
    const sanitizedDetails = details ? String(details).substring(0, 2000) : null;
    const sanitizedEmail = email ? String(email).substring(0, 255) : null;
    const status = watermarkVerified ? 'auto_resolved' : 'manual_review';

    const request = await getOne(
      `INSERT INTO removal_requests (reason, details, status, reporter_email, leaked_image_hash, watermark_user_id, auto_action_taken, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, NOW()) RETURNING id, status, created_at`,
      ['photo_leaked', sanitizedDetails, status, sanitizedEmail, imageHash, watermarkUserId ? parseInt(watermarkUserId, 10) : null, autoActionTaken]
    );

    if (watermarkVerified) {
      return res.json({
        success: true,
        request_id: request.id,
        watermark_detected: true,
        action_taken: autoActionTaken,
        message: 'Watermark verified. Action has been taken. Thank you for reporting this.'
      });
    } else {
      return res.json({
        success: true,
        request_id: request.id,
        watermark_detected: false,
        message: 'Your photo removal request has been received. Our team will review it manually. If you provided an email, we\'ll follow up within 48 hours.'
      });
    }
  } catch (error) {
    console.error('Public photo removal request error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
