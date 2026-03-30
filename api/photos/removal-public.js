const { sql } = require('@vercel/postgres');
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
  // CORS open — public endpoint
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Parse body
    let body;
    if (typeof req.body === 'object' && req.body !== null) {
      body = req.body;
    } else {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      body = JSON.parse(Buffer.concat(chunks).toString());
    }

    const { image, email, details } = body;

    // Validate required fields
    if (!image) {
      return res.status(400).json({ error: 'image (base64) is required' });
    }

    if (email && !validateEmail(email)) {
      return res.status(400).json({ error: 'Invalid email address' });
    }

    // Validate image
    const validated = validateBase64Image(image);
    if (!validated) {
      return res.status(400).json({
        error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 10MB'
      });
    }

    const imageBuffer = validated.buffer;
    const imageHash = crypto.createHash('sha256').update(imageBuffer).digest('hex').substring(0, 64);

    // Extract watermark
    const watermarkResult = extractWatermark(imageBuffer);
    const watermarkVerified = watermarkResult.found && watermarkResult.verified;
    const watermarkUserId = watermarkVerified ? watermarkResult.userId : null;

    let autoActionTaken = null;

    if (watermarkVerified && watermarkUserId) {
      // Look up the leaker
      const leaker = await sql`
        SELECT id, display_name, banned FROM users WHERE id = ${parseInt(watermarkUserId, 10)}
      `;

      if (leaker.rows.length > 0 && !leaker.rows[0].banned) {
        // Auto-ban the leaker
        await sql`
          UPDATE users
          SET banned = true,
              banned_at = NOW(),
              ban_reason = 'Photo leaked outside SafeTea (watermark verified)',
              ban_type = 'permanent'
          WHERE id = ${parseInt(watermarkUserId, 10)}
        `;

        // Hide all their posts
        await sql`
          UPDATE posts SET hidden = true WHERE user_id = ${parseInt(watermarkUserId, 10)}
        `;

        autoActionTaken = 'account_banned_posts_hidden';
      } else if (leaker.rows.length > 0 && leaker.rows[0].banned) {
        autoActionTaken = 'already_banned';
      }
    }

    // Create removal request record
    const sanitizedDetails = details ? String(details).substring(0, 2000) : null;
    const sanitizedEmail = email ? String(email).substring(0, 255) : null;
    const status = watermarkVerified ? 'auto_resolved' : 'manual_review';

    const result = await sql`
      INSERT INTO removal_requests
        (reason, details, status, reporter_email, leaked_image_hash, watermark_user_id, auto_action_taken, created_at)
      VALUES
        ('photo_leaked', ${sanitizedDetails}, ${status}, ${sanitizedEmail}, ${imageHash}, ${watermarkUserId ? parseInt(watermarkUserId, 10) : null}, ${autoActionTaken}, NOW())
      RETURNING id, status, created_at
    `;

    const request = result.rows[0];

    if (watermarkVerified) {
      return res.status(200).json({
        success: true,
        request_id: request.id,
        watermark_detected: true,
        action_taken: autoActionTaken,
        message: 'Watermark verified. The leaker\'s account has been automatically suspended and all their posts have been hidden. Thank you for reporting this.'
      });
    } else {
      return res.status(200).json({
        success: true,
        request_id: request.id,
        watermark_detected: false,
        message: 'Your photo removal request has been received. Our team will review it manually. If you provided an email, we\'ll follow up within 48 hours.'
      });
    }
  } catch (error) {
    console.error('Public photo removal request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
