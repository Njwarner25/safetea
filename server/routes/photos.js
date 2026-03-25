const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { authenticate, requireRole } = require('../middleware/auth');
const { query, getOne, getAll } = require('../db/database');
const { embedWatermark, extractWatermark } = require('../utils/watermark');

const router = express.Router();

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB in bytes
const VALID_CONTEXTS = ['referral', 'avatar', 'post'];

/**
 * Validate base64 image string
 * @param {string} base64Str - Base64 string
 * @returns {Buffer|null} Buffer or null if invalid
 */
function validateBase64Image(base64Str) {
  try {
    // Remove data URI prefix if present (e.g., "data:image/png;base64,")
    const base64Only = base64Str.replace(/^data:image\/\w+;base64,/, '');

    // Check if valid base64
    if (!/^[A-Za-z0-9+/=]*$/.test(base64Only)) {
      return null;
    }

    const buffer = Buffer.from(base64Only, 'base64');

    // Size check
    if (buffer.length > MAX_IMAGE_SIZE) {
      return null;
    }

    // Basic image magic bytes check (PNG, JPEG, WebP)
    const isPNG = buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isJPEG = buffer[0] === 0xFF && buffer[1] === 0xD8;
    const isWebP = buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;

    if (!isPNG && !isJPEG && !isWebP) {
      return null;
    }

    return buffer;
  } catch (err) {
    return null;
  }
}

// POST /api/photos/upload - Upload and watermark a photo
router.post('/upload', authenticate, [
  body('image').notEmpty().isString(),
  body('context').isIn(VALID_CONTEXTS),
  body('context_id').optional().isString()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { image, context, context_id } = req.body;

  try {
    // Validate and convert base64 to buffer
    const imageBuffer = validateBase64Image(image);
    if (!imageBuffer) {
      return res.status(400).json({ error: 'Invalid image: must be valid base64 PNG/JPEG/WebP under 5MB' });
    }

    // Embed watermark
    const watermarkedBuffer = embedWatermark(imageBuffer, req.user.id);
    const watermarkedBase64 = watermarkedBuffer.toString('base64');

    // Compute watermark hash
    const watermarkHash = crypto.createHash('sha256').update(watermarkedBase64).digest('hex');

    // Store photo
    const photoId = uuidv4();
    await query(
      `INSERT INTO photos (id, user_id, image_data, context, context_id, created_at, is_deleted)
       VALUES ($1, $2, $3, $4, $5, NOW(), false)`,
      [photoId, req.user.id, watermarkedBase64, context, context_id || null]
    );

    // Record watermark metadata
    const watermarkId = uuidv4();
    await query(
      `INSERT INTO photo_watermarks (id, photo_id, user_id, watermark_hash, created_at)
       VALUES ($1, $2, $3, $4, NOW())`,
      [watermarkId, photoId, req.user.id, watermarkHash]
    );

    // Return photo record
    const photo = await getOne(
      `SELECT id, user_id, context, context_id, created_at FROM photos WHERE id = $1`,
      [photoId]
    );

    res.status(201).json({
      photo: {
        id: photo.id,
        url: `/api/photos/${photo.id}`,
        context: photo.context,
        context_id: photo.context_id,
        created_at: photo.created_at
      }
    });
  } catch (err) {
    console.error('Photo upload error:', err);
    res.status(500).json({ error: 'Failed to upload photo' });
  }
});

// GET /api/photos/:id - Get a photo
router.get('/:id', authenticate, async (req, res) => {
  try {
    const photo = await getOne(
      `SELECT id, user_id, image_data, context, context_id, created_at, is_deleted FROM photos WHERE id = $1`,
      [req.params.id]
    );

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    if (photo.is_deleted) {
      return res.status(404).json({ error: 'Photo has been deleted' });
    }

    // Return base64 data with metadata
    res.json({
      photo: {
        id: photo.id,
        data: photo.image_data,
        context: photo.context,
        context_id: photo.context_id,
        created_at: photo.created_at
      }
    });
  } catch (err) {
    console.error('Photo retrieval error:', err);
    res.status(500).json({ error: 'Failed to retrieve photo' });
  }
});

// DELETE /api/photos/:id - Soft delete a photo
router.delete('/:id', authenticate, async (req, res) => {
  try {
    const photo = await getOne(
      `SELECT id, user_id FROM photos WHERE id = $1 AND is_deleted = false`,
      [req.params.id]
    );

    if (!photo) {
      return res.status(404).json({ error: 'Photo not found' });
    }

    // Authorization check: user can only delete their own photos
    if (photo.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'You can only delete your own photos' });
    }

    // Soft delete
    await query(
      `UPDATE photos SET is_deleted = true WHERE id = $1`,
      [req.params.id]
    );

    res.json({ message: 'Photo deleted successfully' });
  } catch (err) {
    console.error('Photo deletion error:', err);
    res.status(500).json({ error: 'Failed to delete photo' });
  }
});

module.exports = router;
