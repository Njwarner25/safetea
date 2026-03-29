const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { sendRemovalStatusEmail, sendStrikeBanEmail } = require('../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admin-only guard
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // ─── GET: List removal requests ─────────────────────────────────────
  if (req.method === 'GET') {
    try {
      const status = req.query.status || 'pending';
      const limit = Math.min(parseInt(req.query.limit) || 50, 100);
      const offset = parseInt(req.query.offset) || 0;

      const requests = await getMany(
        `SELECT
           prr.id,
           prr.requester_id,
           prr.photo_id,
           prr.reason,
           prr.additional_context,
           prr.watermark_detected,
           prr.watermark_uploader_id,
           prr.status,
           prr.reviewer_notes,
           prr.created_at,
           prr.reviewed_at,
           prr.resolved_at,
           req_user.display_name AS requester_name,
           req_user.email AS requester_email,
           up_user.display_name AS uploader_name,
           up_user.email AS uploader_email,
           up_user.banned AS uploader_banned
         FROM photo_removal_requests prr
         LEFT JOIN users req_user ON req_user.id = prr.requester_id
         LEFT JOIN users up_user ON up_user.id = prr.watermark_uploader_id
         WHERE prr.status = $1
         ORDER BY prr.created_at ASC
         LIMIT $2 OFFSET $3`,
        [status, limit, offset]
      );

      // Get total count for pagination
      const countResult = await getOne(
        'SELECT COUNT(*) as total FROM photo_removal_requests WHERE status = $1',
        [status]
      );

      // For each request with a watermark uploader, get their strike count
      for (const request of requests) {
        if (request.watermark_uploader_id) {
          const strikes = await getOne(
            `SELECT COUNT(*) as count FROM user_strikes
             WHERE user_id = $1 AND status = 'applied'`,
            [request.watermark_uploader_id]
          );
          request.uploader_strike_count = parseInt(strikes?.count || 0);
        }
      }

      return res.status(200).json({
        success: true,
        requests,
        total: parseInt(countResult?.total || 0),
        limit,
        offset,
      });
    } catch (err) {
      console.error('List removal requests error:', err);
      return res.status(500).json({ error: 'Failed to list removal requests' });
    }
  }

  // ─── POST: Approve or deny a removal request ───────────────────────
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { request_id, action, reviewer_notes } = body;

      if (!request_id) {
        return res.status(400).json({ error: 'request_id is required' });
      }
      if (!action || !['approve', 'deny', 'escalate'].includes(action)) {
        return res.status(400).json({ error: 'action must be approve, deny, or escalate' });
      }

      // Get the removal request
      const request = await getOne(
        'SELECT * FROM photo_removal_requests WHERE id = $1',
        [request_id]
      );
      if (!request) {
        return res.status(404).json({ error: 'Removal request not found' });
      }
      if (request.status !== 'pending' && request.status !== 'reviewing') {
        return res.status(400).json({
          error: `Request already ${request.status}. Cannot change.`
        });
      }

      const now = new Date();

      // ── APPROVE ──
      if (action === 'approve') {
        // 1. Update request status
        await run(
          `UPDATE photo_removal_requests
           SET status = 'approved', reviewer_notes = $1, reviewed_at = $2, resolved_at = $2
           WHERE id = $3`,
          [reviewer_notes || 'Approved by admin', now, request_id]
        );

        // 2. Soft-delete the photo if it references one in our DB
        if (request.photo_id) {
          await run(
            'UPDATE photos SET is_deleted = true WHERE id = $1',
            [request.photo_id]
          );
        }

        // 3. Apply strike to the uploader if watermark identified them
        if (request.watermark_detected && request.watermark_uploader_id) {
          // Apply the pending strike
          await run(
            `UPDATE user_strikes SET status = 'applied', applied_at = $1
             WHERE removal_request_id = $2 AND status = 'pending'`,
            [now, request_id]
          );

          // If no pending strike existed, create and apply one
          const existingStrike = await getOne(
            'SELECT id FROM user_strikes WHERE removal_request_id = $1',
            [request_id]
          );
          if (!existingStrike) {
            await run(
              `INSERT INTO user_strikes (user_id, reason, removal_request_id, status, applied_at, created_at)
               VALUES ($1, 'photo_removal_approved', $2, 'applied', $3, $3)`,
              [request.watermark_uploader_id, request_id, now]
            );
          }

          // Check total applied strikes for auto-action
          const totalStrikes = await getOne(
            `SELECT COUNT(*) as count FROM user_strikes
             WHERE user_id = $1 AND status = 'applied'`,
            [request.watermark_uploader_id]
          );
          const strikeCount = parseInt(totalStrikes?.count || 0);

          // 3 strikes → 7-day temporary suspension
          if (strikeCount >= 3 && strikeCount < 5) {
            const banUntil = new Date();
            banUntil.setDate(banUntil.getDate() + 7);

            await run(
              `UPDATE users
               SET banned = true, banned_at = $1, ban_reason = $2, ban_type = 'temporary', ban_until = $3
               WHERE id = $4 AND (banned = false OR ban_type = 'temporary')`,
              [now, `Auto-suspended: ${strikeCount} photo removal strikes`, banUntil, request.watermark_uploader_id]
            );
          }

          // 5+ strikes → flag for permanent ban review (don't auto-ban)
          if (strikeCount >= 5) {
            await run(
              `UPDATE users
               SET banned = true, banned_at = $1, ban_reason = $2, ban_type = 'permanent'
               WHERE id = $3`,
              [now, `Flagged for permanent ban review: ${strikeCount} photo removal strikes`, request.watermark_uploader_id]
            );
          }
        }

        return res.status(200).json({
          success: true,
          // Email the uploader about the removal + strike
          if (request.watermark_uploader_id) {
            getOne('SELECT email, display_name FROM users WHERE id = $1', [request.watermark_uploader_id]).then(function(uploader) {
              if (uploader && uploader.email) {
                sendRemovalStatusEmail(uploader.email, uploader.display_name, 'approved').catch(function() {});
              }
            }).catch(function() {});
          }

          message: 'Removal request approved. Photo deleted and uploader notified.',
          request_id,
          action: 'approved',
          photo_deleted: !!request.photo_id,
          strike_applied: !!(request.watermark_detected && request.watermark_uploader_id),
        });
      }

      // ── DENY ──
      if (action === 'deny') {
        await run(
          `UPDATE photo_removal_requests
           SET status = 'denied', reviewer_notes = $1, reviewed_at = $2, resolved_at = $2
           WHERE id = $3`,
          [reviewer_notes || 'Denied by admin', now, request_id]
        );

        // Remove any pending strikes
        if (request.watermark_uploader_id) {
          await run(
            `DELETE FROM user_strikes
             WHERE removal_request_id = $1 AND status = 'pending'`,
            [request_id]
          );
        }

        return res.status(200).json({
          success: true,
          message: 'Removal request denied.',
          request_id,
          action: 'denied',
        });
      }

      // ── ESCALATE ──
      if (action === 'escalate') {
        await run(
          `UPDATE photo_removal_requests
           SET status = 'escalated', reviewer_notes = $1, reviewed_at = $2
           WHERE id = $3`,
          [reviewer_notes || 'Escalated for further review', now, request_id]
        );

        return res.status(200).json({
          success: true,
          message: 'Removal request escalated for further review.',
          request_id,
          action: 'escalated',
        });
      }
    } catch (err) {
      console.error('Action removal request error:', err);
      return res.status(500).json({ error: 'Failed to process removal request action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
