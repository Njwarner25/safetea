const express = require('express');
const rateLimit = require('express-rate-limit');
const { body, validationResult, query: validateQuery } = require('express-validator');
const { v4: uuidv4 } = require('uuid');
const { getOne, getAll, query } = require('../db/database');
const { authenticate } = require('../middleware/auth');
const { extractWatermark } = require('../utils/watermark');

const router = express.Router();

// Rate limiter: 3 requests per hour per IP for removal requests submission
const removalRequestLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3,
  keyGenerator: (req, res) => req.ip,
  message: { error: 'Maximum 3 removal requests per hour. Please try again later.' }
});

/**
 * Helper: Generate case number in format RR-YYYY-NNNN
 */
async function generateCaseNumber() {
  const year = new Date().getFullYear();

  // Get count of requests from current year
  const result = await getOne(
    `SELECT COUNT(*) as count FROM removal_requests
     WHERE EXTRACT(YEAR FROM created_at) = $1`,
    [year]
  );

  const count = (result?.count || 0) + 1;
  const paddedNumber = String(count).padStart(4, '0');

  return `RR-${year}-${paddedNumber}`;
}

/**
 * Helper: Validate email format
 */
function isValidEmail(email) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Helper: Convert base64 string to Buffer
 */
function base64ToBuffer(base64String) {
  try {
    return Buffer.from(base64String, 'base64');
  } catch (err) {
    return null;
  }
}

// POST /api/removal-requests - Submit a photo removal request
router.post('/', removalRequestLimiter, [
  body('requester_name').trim().isLength({ min: 2, max: 100 }),
  body('requester_email').trim().custom(val => {
    if (!isValidEmail(val)) {
      throw new Error('Invalid email format');
    }
    return true;
  }),
  body('relationship').isIn(['self', 'known_person']),
  body('photo').notEmpty().withMessage('Photo is required'),
  body('context').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { requester_name, requester_email, relationship, photo, context } = req.body;

  try {
    // Convert base64 to buffer
    const photoBuffer = base64ToBuffer(photo);
    if (!photoBuffer) {
      return res.status(400).json({ error: 'Invalid photo format. Please provide a valid base64-encoded image.' });
    }

    // Extract watermark
    const watermarkResult = extractWatermark(photoBuffer);
    const watermarkDetected = watermarkResult.found;
    const watermarkUserId = watermarkResult.userId || null;

    // Generate case number
    const caseNumber = await generateCaseNumber();

    // Determine status
    const status = watermarkDetected ? 'watermark_verified' : 'submitted';

    // Create removal request record
    const id = uuidv4();
    const slsDeadline = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();

    await query(
      `INSERT INTO removal_requests
       (id, case_number, requester_name, requester_email, relationship, photo_base64, context,
        watermark_detected, watermark_user_id, status, sla_deadline, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, NOW())`,
      [
        id,
        caseNumber,
        requester_name,
        requester_email,
        relationship,
        photo, // Store the original base64
        context || null,
        watermarkDetected,
        watermarkUserId,
        status,
        slsDeadline
      ]
    );

    // If watermark detected, trigger ban flow
    if (watermarkDetected && watermarkUserId) {
      try {
        // Get current strike count for user
        const strikeResult = await getOne(
          `SELECT COUNT(*) as count FROM user_strikes WHERE user_id = $1 AND appeal_status != 'approved'`,
          [watermarkUserId]
        );

        const currentStrikes = strikeResult?.count || 0;
        const strikeCount = currentStrikes + 1;

        // Determine suspension duration based on strike count
        let suspensionDays = 30;
        if (strikeCount === 2) {
          suspensionDays = 90;
        } else if (strikeCount >= 3) {
          suspensionDays = 10950; // Approximately 30 years (permanent)
        }

        const suspensionEnd = new Date(Date.now() + suspensionDays * 24 * 60 * 60 * 1000);

        // Insert strike
        const strikeId = uuidv4();
        await query(
          `INSERT INTO user_strikes
           (id, user_id, strike_reason, strike_count, suspension_end, appeal_status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, NOW())`,
          [
            strikeId,
            watermarkUserId,
            'Non-consensual photo sharing - verified by SafeTea watermark',
            strikeCount,
            suspensionEnd,
            'pending'
          ]
        );

        // Update user suspension status
        await query(
          `UPDATE users SET is_suspended = true, suspension_end = $1 WHERE id = $2`,
          [suspensionEnd, watermarkUserId]
        );
      } catch (err) {
        console.error('Error in ban flow for watermark detection:', err);
        // Don't fail the removal request, but log the error
      }
    }

    // Prepare response message
    let message;
    if (watermarkDetected) {
      message = 'We have verified this photo originated from SafeTea. It has been removed and action has been taken against the responsible account.';
    } else {
      message = 'We were unable to verify that this photo originated from SafeTea. All photos uploaded to our platform contain a digital watermark, and the image you submitted does not contain one. If you believe this is an error, please re-submit the original unedited photo.';
    }

    res.status(201).json({
      case_number: caseNumber,
      status,
      watermark_detected: watermarkDetected,
      message
    });
  } catch (err) {
    console.error('Removal request submission error:', err);
    res.status(500).json({ error: 'Failed to submit removal request' });
  }
});

// GET /api/removal-requests/:caseNumber - Check status of a removal request
router.get('/:caseNumber', [
  validateQuery('email').trim().custom(val => {
    if (!isValidEmail(val)) {
      throw new Error('Invalid email format');
    }
    return true;
  })
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { caseNumber } = req.params;
  const { email } = req.query;

  try {
    const request = await getOne(
      `SELECT case_number, status, watermark_detected, sla_deadline, created_at
       FROM removal_requests
       WHERE case_number = $1 AND requester_email = $2`,
      [caseNumber, email]
    );

    if (!request) {
      return res.status(404).json({ error: 'Case not found. Please verify the case number and email address.' });
    }

    res.json({
      case_number: request.case_number,
      status: request.status,
      watermark_detected: request.watermark_detected,
      sla_deadline: request.sla_deadline,
      created_at: request.created_at
    });
  } catch (err) {
    console.error('Removal request lookup error:', err);
    res.status(500).json({ error: 'Failed to retrieve removal request' });
  }
});

// GET /api/admin/removal-requests - List all removal requests (admin only)
router.get('/admin/list', authenticate, async (req, res) => {
  // Check admin role manually for this route
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { status, page = 1, limit = 20 } = req.query;
    const offset = (page - 1) * limit;

    let sql = 'SELECT id, case_number, requester_name, requester_email, status, watermark_detected, watermark_user_id, sla_deadline, created_at FROM removal_requests';
    const params = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    sql += ' ORDER BY created_at DESC LIMIT $' + (params.length + 1) + ' OFFSET $' + (params.length + 2);
    params.push(limit, offset);

    const requests = await getAll(sql, params);

    // Get total count
    let countSql = 'SELECT COUNT(*) as count FROM removal_requests';
    const countParams = [];
    if (status) {
      countSql += ' WHERE status = $1';
      countParams.push(status);
    }

    const countResult = await getOne(countSql, countParams);
    const total = countResult?.count || 0;

    res.json({
      data: requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });
  } catch (err) {
    console.error('Admin removal requests list error:', err);
    res.status(500).json({ error: 'Failed to retrieve removal requests' });
  }
});

// PATCH /api/admin/removal-requests/:id - Update removal request status (admin only)
router.patch('/admin/:id', authenticate, [
  body('status').isIn(['submitted', 'watermark_verified', 'resolved', 'dismissed']),
  body('resolution_notes').optional().trim().isLength({ max: 1000 })
], async (req, res) => {
  // Check admin role manually for this route
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { id } = req.params;
  const { status, resolution_notes } = req.body;

  try {
    const request = await getOne('SELECT id FROM removal_requests WHERE id = $1', [id]);
    if (!request) {
      return res.status(404).json({ error: 'Removal request not found' });
    }

    await query(
      `UPDATE removal_requests
       SET status = $1, resolution_notes = $2, updated_at = NOW()
       WHERE id = $3`,
      [status, resolution_notes || null, id]
    );

    const updated = await getOne(
      'SELECT id, case_number, status, resolution_notes FROM removal_requests WHERE id = $1',
      [id]
    );

    res.json(updated);
  } catch (err) {
    console.error('Admin removal request update error:', err);
    res.status(500).json({ error: 'Failed to update removal request' });
  }
});

module.exports = router;
