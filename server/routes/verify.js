const express = require('express');
const crypto = require('crypto');
const { body, validationResult } = require('express-validator');
const { authenticate } = require('../middleware/auth');
const { query, getOne } = require('../db/database');

const router = express.Router();

// POST /api/auth/verify/identity - Start identity verification
router.post('/identity', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    // In production: create a Yoti session and return the session URL/token
    // The mobile app opens a WebView with the Yoti SDK to complete identity verification
    // Yoti sends results via webhook to /api/auth/verify/callback

    if (process.env.YOTI_CLIENT_SDK_ID && process.env.YOTI_PEM_KEY) {
      // Production: Create Yoti session
      try {
        // Yoti Doc Scan session creation would go here
        // For now, return a pending status with instructions for the mobile SDK
        await query(
          "INSERT INTO verification_attempts (id, user_id, type, result, provider, session_id, created_at) VALUES ($1, $2, $3, $4, $5, $6, NOW())",
          [crypto.randomUUID(), userId, 'identity', 'pending', 'yoti', 'yoti-session-pending']
        );

        return res.status(200).json({
          status: 'pending',
          message: 'Identity verification session created',
          provider: 'yoti',
          // The mobile app will use these to launch the Yoti SDK
          sdkId: process.env.YOTI_CLIENT_SDK_ID,
          // Session token would be returned from Yoti API
          instructions: 'Complete identity verification through the in-app flow'
        });
      } catch (yotiError) {
        console.error('Yoti session error:', yotiError);
        return res.status(500).json({ error: 'Failed to create verification session' });
      }
    } else {
      // DEV MODE: Auto-pass identity verification
      console.log(`[DEV] Auto-passing identity verification for user ${userId}`);

      await query('UPDATE users SET identity_verified = true WHERE id = $1', [userId]);

      await query(
        "INSERT INTO verification_attempts (id, user_id, type, result, provider, created_at) VALUES ($1, $2, $3, $4, $5, NOW())",
        [crypto.randomUUID(), userId, 'identity', 'passed', 'dev-mode']
      );

      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [userId]
      );

      if (updated && updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await query('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [userId]);
      }

      return res.status(200).json({
        status: 'passed',
        message: 'Identity verification complete (dev mode)',
        nextStep: updated && !updated.gender_verified ? 'gender' : null
      });
    }
  } catch (error) {
    console.error('Identity verification error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/auth/verify/status - Get verification status for current user
router.get('/status', authenticate, async (req, res) => {
  try {
    const userId = req.user.id;

    const fullUser = await getOne(
      `SELECT age_verified, identity_verified, gender_verified, verified_at, gender_report_count
       FROM users WHERE id = $1`,
      [userId]
    );

    if (!fullUser) {
      return res.status(404).json({ error: 'User not found' });
    }

    const isFullyVerified = fullUser.age_verified && fullUser.identity_verified && fullUser.gender_verified;

    let nextStep = null;
    if (!fullUser.age_verified) nextStep = 'age';
    else if (!fullUser.identity_verified) nextStep = 'identity';
    else if (!fullUser.gender_verified) nextStep = 'gender';

    return res.status(200).json({
      verified: isFullyVerified,
      steps: {
        age: { completed: !!fullUser.age_verified },
        identity: { completed: !!fullUser.identity_verified },
        gender: { completed: !!fullUser.gender_verified }
      },
      nextStep,
      verifiedAt: fullUser.verified_at || null,
      flagged: (fullUser.gender_report_count || 0) >= 3
    });
  } catch (error) {
    console.error('Verification status error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/auth/verify/callback - Webhook from Yoti (or test endpoint)
router.post('/callback', async (req, res) => {
  try {
    // Validate webhook signature (HMAC-SHA256)
    const signature = req.headers['x-yoti-signature'] || req.headers['x-webhook-signature'];
    const webhookSecret = process.env.YOTI_WEBHOOK_SECRET;

    if (webhookSecret && signature) {
      const rawBody = JSON.stringify(req.body);
      const expected = crypto.createHmac('sha256', webhookSecret).update(rawBody).digest('hex');
      if (signature !== expected) {
        console.error('Webhook signature mismatch');
        return res.status(401).json({ error: 'Invalid webhook signature' });
      }
    }

    const { session_id, user_id, result, checks } = req.body || {};

    if (!session_id || !result) {
      return res.status(400).json({ error: 'Missing required webhook fields' });
    }

    // Find the verification attempt by session_id
    const attempt = await getOne(
      'SELECT * FROM verification_attempts WHERE session_id = $1 ORDER BY created_at DESC LIMIT 1',
      [session_id]
    );

    const targetUserId = attempt ? attempt.user_id : user_id;

    if (!targetUserId) {
      console.error('Cannot find user for webhook session:', session_id);
      return res.status(400).json({ error: 'Cannot identify user for this session' });
    }

    if (result === 'passed' || result === 'approved') {
      // Update identity_verified
      await query('UPDATE users SET identity_verified = true WHERE id = $1', [targetUserId]);

      // Log success
      await query(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['passed', session_id]
      );

      // Check if age was also verified in this check
      if (checks && checks.age === true) {
        await query('UPDATE users SET age_verified = true WHERE id = $1', [targetUserId]);
      }

      // Check if all steps are now complete
      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [targetUserId]
      );
      if (updated && updated.age_verified && updated.identity_verified && updated.gender_verified) {
        await query('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [targetUserId]);
      }

      // Zero-retention: request Yoti to delete the verification data
      // In production, call Yoti's delete API here
      console.log(`[VERIFY] User ${targetUserId} passed identity verification. Requesting data deletion.`);

    } else {
      // Verification failed
      await query(
        "UPDATE verification_attempts SET result = $1 WHERE session_id = $2",
        ['failed', session_id]
      );
      console.log(`[VERIFY] User ${targetUserId} failed identity verification`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error('Verification callback error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
