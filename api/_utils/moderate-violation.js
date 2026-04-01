/**
 * AI Moderation Decision Engine
 * Uses Claude Sonnet to evaluate violations and make enforcement decisions.
 */

const { getOne, getMany, run } = require('./db');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

/**
 * Evaluate a violation and return an AI decision.
 */
async function evaluateViolation(violation) {
  if (!ANTHROPIC_KEY) {
    console.log('[Moderation] ANTHROPIC_API_KEY not configured — defaulting to escalate');
    return { decision: 'dismiss', reason: 'Moderation AI not configured', confidence: 0, escalate_to_human: true, notify_user: false };
  }

  // Get account history
  const user = await getOne('SELECT id, email, display_name, created_at, subscription_tier, banned FROM users WHERE id = $1', [violation.accused_user_id]);
  if (!user) return { decision: 'dismiss', reason: 'User not found', confidence: 1.0, escalate_to_human: false, notify_user: false };

  const priorViolations = await getMany(
    `SELECT type, status, created_at FROM violations WHERE accused_user_id = $1 AND status IN ('warning_issued', 'upheld')`,
    [violation.accused_user_id]
  );

  const accountAgeDays = Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24));

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are SafeTea's content moderation AI. You review violations and determine appropriate actions. You must respond with ONLY a JSON object, no other text.

VIOLATION TYPES AND PENALTIES:
- photo_leak (watermarked photo found outside platform): First offense = 30-day suspension. Second offense = lifetime ban.
- prohibited_content (nudity, hate speech, doxxing, personal info exposure): First offense = 30-day suspension. Second offense = lifetime ban.
- harassment (threatening or abusive messages/comments): First offense = warning. Second offense = 30-day suspension. Third offense = lifetime ban.
- fake_account (impersonation, fake identity): Always lifetime ban.
- screenshot_attempt (detected screenshot): First offense = warning. Second offense = 30-day suspension.

RESPONSE FORMAT:
{"decision": "warning" | "suspend_30" | "lifetime_ban" | "dismiss", "reason": "Brief explanation of the decision", "confidence": 0.0-1.0, "notify_user": true/false, "escalate_to_human": true/false}

Set escalate_to_human to true if confidence is below 0.7 or if the case is ambiguous.`,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            violation_type: violation.type,
            evidence_summary: violation.context || violation.evidence || '',
            prior_violations: priorViolations.length,
            prior_violation_types: priorViolations.map(v => v.type),
            account_age_days: accountAgeDays,
            account_status: user.banned ? 'banned' : 'active',
            has_active_subscription: user.subscription_tier !== 'free'
          })
        }]
      })
    });

    if (!response.ok) {
      console.error('[Moderation] Claude API error:', response.status);
      return { decision: 'dismiss', reason: 'AI moderation unavailable', confidence: 0, escalate_to_human: true, notify_user: false };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { decision: 'dismiss', reason: 'AI response unparseable', confidence: 0, escalate_to_human: true, notify_user: false };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[Moderation] AI evaluation error:', err.message);
    return { decision: 'dismiss', reason: 'AI error: ' + err.message, confidence: 0, escalate_to_human: true, notify_user: false };
  }
}

/**
 * Apply a moderation decision to a user/violation.
 */
async function applyDecision(violationId, decision, userId) {
  const user = await getOne('SELECT id, email, display_name, banned FROM users WHERE id = $1', [userId]);
  if (!user) return;

  switch (decision.decision) {
    case 'warning':
      await run(`UPDATE violations SET status = 'warning_issued', ai_decision = $1, resolved_at = NOW() WHERE id = $2`,
        [JSON.stringify(decision), violationId]);
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1 WHERE id = $1', [userId]);
      break;

    case 'suspend_30':
      const suspensionEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      await run(`UPDATE violations SET status = 'upheld', ai_decision = $1, resolved_at = NOW() WHERE id = $2`,
        [JSON.stringify(decision), violationId]);
      await run(
        `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'suspension',
         ban_until = $2, suspended_at = NOW(), suspension_ends_at = $2, suspension_reason = $1,
         violation_count = COALESCE(violation_count, 0) + 1 WHERE id = $3`,
        [decision.reason, suspensionEnd.toISOString(), userId]
      );
      break;

    case 'lifetime_ban':
      await run(`UPDATE violations SET status = 'upheld', ai_decision = $1, resolved_at = NOW() WHERE id = $2`,
        [JSON.stringify(decision), violationId]);
      await run(
        `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent',
         violation_count = COALESCE(violation_count, 0) + 1 WHERE id = $2`,
        [decision.reason, userId]
      );
      // Hide all posts from banned user
      await run('UPDATE posts SET hidden = true WHERE user_id = $1', [userId]).catch(() => {});
      break;

    case 'dismiss':
      await run(`UPDATE violations SET status = 'dismissed', ai_decision = $1, resolved_at = NOW() WHERE id = $2`,
        [JSON.stringify(decision), violationId]);
      break;
  }

  // Flag for human review if low confidence
  if (decision.escalate_to_human) {
    await run('UPDATE violations SET escalated_to_human = true WHERE id = $1', [violationId]);
  }

  // Log the action
  await run(
    `INSERT INTO moderation_logs (user_id, action, reason, category, details, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [userId, 'moderation_' + decision.decision, decision.reason, 'violation',
     JSON.stringify({ violation_id: violationId, confidence: decision.confidence })]
  ).catch(() => {});
}

/**
 * Evaluate an appeal against the original violation.
 */
async function evaluateAppeal(appeal) {
  if (!ANTHROPIC_KEY) {
    return { decision: 'uphold', reason: 'Appeal AI not configured', confidence: 0, modified_penalty: null, escalate_to_human: true };
  }

  const violation = await getOne('SELECT * FROM violations WHERE id = $1', [appeal.violation_id]);
  const user = await getOne('SELECT id, created_at FROM users WHERE id = $1', [appeal.user_id]);
  const priorViolations = await getMany(
    `SELECT type FROM violations WHERE accused_user_id = $1 AND status = 'upheld'`,
    [appeal.user_id]
  );

  const accountAgeDays = user ? Math.floor((Date.now() - new Date(user.created_at).getTime()) / (1000 * 60 * 60 * 24)) : 0;

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        system: `You are SafeTea's appeal review AI. A user is appealing a moderation decision. Review the original violation, the user's appeal, and their account history. Make a fair decision.

GUIDELINES:
- Overturn if the user provides a credible explanation that suggests the violation was a mistake or misunderstanding.
- Uphold if the evidence clearly supports the original decision regardless of the appeal.
- Consider account age, prior behavior, and the severity of the violation.
- Err on the side of community safety — SafeTea protects women.
- If the photo leak watermark evidence is clear and matches the account, the appeal should generally be upheld unless the user can explain how someone else accessed their account.

RESPONSE FORMAT (JSON only):
{"decision": "uphold" | "overturn", "reason": "Clear explanation", "confidence": 0.0-1.0, "modified_penalty": null | "warning" | "suspend_30", "escalate_to_human": true/false}

modified_penalty: Only used if overturning to a lesser penalty instead of full dismissal.
Set escalate_to_human if confidence is below 0.7.`,
        messages: [{
          role: 'user',
          content: JSON.stringify({
            original_violation: {
              type: violation?.type,
              reason: violation?.ai_decision?.reason || violation?.context,
              original_decision: violation?.ai_decision?.decision,
              evidence: violation?.context
            },
            appeal_text: appeal.text,
            account_history: {
              age_days: accountAgeDays,
              prior_violations: priorViolations.length,
              prior_types: priorViolations.map(v => v.type),
            }
          })
        }]
      })
    });

    if (!response.ok) {
      return { decision: 'uphold', reason: 'Appeal AI unavailable', confidence: 0, modified_penalty: null, escalate_to_human: true };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { decision: 'uphold', reason: 'AI response unparseable', confidence: 0, modified_penalty: null, escalate_to_human: true };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[Moderation] Appeal evaluation error:', err.message);
    return { decision: 'uphold', reason: 'AI error', confidence: 0, modified_penalty: null, escalate_to_human: true };
  }
}

module.exports = { evaluateViolation, applyDecision, evaluateAppeal };
