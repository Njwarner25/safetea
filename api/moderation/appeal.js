const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { evaluateAppeal, applyDecision } = require('../_utils/moderate-violation');
const { sendEmail, wrapHtml } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // POST = submit appeal, GET = check appeal status
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { violation_id, text } = body;

      if (!violation_id || !text) {
        return res.status(400).json({ error: 'violation_id and text are required' });
      }
      if (text.length > 1000) {
        return res.status(400).json({ error: 'Appeal text must be 1000 characters or fewer' });
      }

      // Verify violation belongs to this user
      const violation = await getOne(
        'SELECT * FROM violations WHERE id = $1 AND accused_user_id = $2',
        [violation_id, user.id]
      );
      if (!violation) {
        return res.status(404).json({ error: 'Violation not found' });
      }

      // Check 7-day appeal window
      const daysSinceViolation = (Date.now() - new Date(violation.created_at).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceViolation > 7) {
        return res.status(400).json({ error: 'Appeal window has closed (7 days)' });
      }

      // Check if appeal already submitted
      const existingAppeal = await getOne(
        'SELECT id FROM appeals WHERE violation_id = $1',
        [violation_id]
      );
      if (existingAppeal) {
        return res.status(400).json({ error: 'An appeal has already been submitted for this violation' });
      }

      // Create appeal
      const appeal = await getOne(
        `INSERT INTO appeals (violation_id, user_id, text, status, submitted_at)
         VALUES ($1, $2, $3, 'pending', NOW()) RETURNING *`,
        [violation_id, user.id, text.trim()]
      );

      // Mark violation as having an appeal
      await run('UPDATE violations SET appeal_submitted = true WHERE id = $1', [violation_id]);

      // AI review the appeal
      const decision = await evaluateAppeal(appeal);

      // Apply appeal decision
      if (decision.decision === 'overturn') {
        if (decision.modified_penalty) {
          // Reduce to lesser penalty
          await run(`UPDATE appeals SET status = 'approved', ai_decision = $1, reviewed_at = NOW() WHERE id = $2`,
            [JSON.stringify(decision), appeal.id]);

          if (decision.modified_penalty === 'warning') {
            // Lift suspension, apply warning only
            await run(
              `UPDATE users SET banned = false, banned_at = NULL, ban_reason = NULL, ban_type = NULL,
               ban_until = NULL, suspended_at = NULL, suspension_ends_at = NULL, suspension_reason = NULL
               WHERE id = $1`,
              [user.id]
            );
          }
        } else {
          // Full overturn — reinstate account
          await run(`UPDATE appeals SET status = 'approved', ai_decision = $1, reviewed_at = NOW() WHERE id = $2`,
            [JSON.stringify(decision), appeal.id]);
          await run(`UPDATE violations SET status = 'overturned' WHERE id = $1`, [violation_id]);
          await run(
            `UPDATE users SET banned = false, banned_at = NULL, ban_reason = NULL, ban_type = NULL,
             ban_until = NULL, suspended_at = NULL, suspension_ends_at = NULL, suspension_reason = NULL
             WHERE id = $1`,
            [user.id]
          );
          // Unhide posts
          await run('UPDATE posts SET hidden = false WHERE user_id = $1', [user.id]).catch(() => {});
        }

        // Send approval email
        await sendEmail({
          to: user.email,
          subject: 'SafeTea Appeal Approved',
          html: wrapHtml(`
            <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Appeal Approved</h2>
            <p>Your appeal has been reviewed and approved.</p>
            <p><strong style="color:#E8A0B5;">Reason:</strong> ${decision.reason}</p>
            <div style="text-align:center;margin:24px 0;">
              <a href="https://getsafetea.app/login.html" style="display:inline-block;background:linear-gradient(135deg,#2ecc71,#27ae60);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;">Return to SafeTea</a>
            </div>
          `)
        }).catch(() => {});

      } else {
        // Uphold original decision
        await run(`UPDATE appeals SET status = 'denied', ai_decision = $1, reviewed_at = NOW() WHERE id = $2`,
          [JSON.stringify(decision), appeal.id]);

        // Send denial email
        await sendEmail({
          to: user.email,
          subject: 'SafeTea Appeal Decision',
          html: wrapHtml(`
            <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Appeal Denied</h2>
            <p>Your appeal has been reviewed. The original decision stands.</p>
            <p><strong style="color:#E8A0B5;">Reason:</strong> ${decision.reason}</p>
            <p style="color:#8080A0;font-size:13px;">This decision is final.</p>
          `)
        }).catch(() => {});
      }

      // Escalate to human if needed
      if (decision.escalate_to_human) {
        await run('UPDATE violations SET escalated_to_human = true WHERE id = $1', [violation_id]);
      }

      return res.status(200).json({
        success: true,
        appeal: {
          id: appeal.id,
          status: decision.decision === 'overturn' ? 'approved' : 'denied',
          decision: decision.decision,
          reason: decision.reason,
          escalated: decision.escalate_to_human || false
        }
      });
    } catch (err) {
      console.error('Appeal submission error:', err);
      return res.status(500).json({ error: 'Failed to submit appeal' });
    }

  } else if (req.method === 'GET') {
    // Get user's violations and appeal statuses
    try {
      const violations = await getOne(
        `SELECT v.*, a.id as appeal_id, a.status as appeal_status, a.ai_decision as appeal_decision, a.submitted_at as appeal_submitted_at
         FROM violations v
         LEFT JOIN appeals a ON a.violation_id = v.id
         WHERE v.accused_user_id = $1
         ORDER BY v.created_at DESC
         LIMIT 1`,
        [user.id]
      );

      return res.status(200).json({ violation: violations || null });
    } catch (err) {
      console.error('Appeal status error:', err);
      return res.status(500).json({ error: 'Failed to get appeal status' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
