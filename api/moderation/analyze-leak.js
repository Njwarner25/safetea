const { cors, parseBody, authenticate } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { extractWatermark } = require('../_utils/watermark');
const { evaluateViolation, applyDecision } = require('../_utils/moderate-violation');
const { sendStrikeBanEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth optional — can be submitted by logged-in user or public
    let reporter = null;
    try { reporter = await authenticate(req); } catch(e) {}

    const body = await parseBody(req);
    const { image, context } = body;

    if (!image) return res.status(400).json({ error: 'image (base64) is required' });

    // Strip data URI prefix
    const base64Only = image.replace(/^data:image\/\w+;base64,/, '');
    const imageBuffer = Buffer.from(base64Only, 'base64');

    if (imageBuffer.length < 512) {
      return res.status(400).json({ error: 'Image too small to analyze' });
    }

    // Extract steganographic watermark
    const wmResult = extractWatermark(imageBuffer);

    if (!wmResult.found) {
      return res.status(200).json({
        found: false,
        message: 'No SafeTea watermark detected. This photo may not be from SafeTea or the watermark was destroyed.'
      });
    }

    // Watermark found — identify the account
    const uploader = await getOne(
      'SELECT id, email, display_name, banned FROM users WHERE id = $1',
      [wmResult.userId]
    );

    if (!uploader) {
      return res.status(200).json({
        found: true,
        message: 'Watermark detected but account no longer exists.',
        watermarkData: { userId: wmResult.userId, timestamp: wmResult.timestamp, verified: wmResult.verified }
      });
    }

    // Create violation record
    const violation = await getOne(
      `INSERT INTO violations (type, accused_user_id, reported_by, reported_by_system, evidence, context, status, created_at)
       VALUES ('photo_leak', $1, $2, $3, $4, $5, 'pending_review', NOW()) RETURNING *`,
      [
        uploader.id,
        reporter ? reporter.id : null,
        !reporter,
        'Watermark extracted: userId=' + wmResult.userId + ', timestamp=' + wmResult.timestamp + ', verified=' + wmResult.verified,
        context || 'Photo leaked outside SafeTea platform'
      ]
    );

    // Trigger AI moderation
    const decision = await evaluateViolation(violation);

    // Apply the decision
    await applyDecision(violation.id, decision, uploader.id);

    // Send notification email if action taken
    if (decision.decision === 'suspend_30' || decision.decision === 'lifetime_ban') {
      const isBanned = decision.decision === 'lifetime_ban';
      const strikeCount = isBanned ? 3 : 1;
      await sendStrikeBanEmail(uploader.email, uploader.display_name, strikeCount, isBanned).catch(() => {});
    }

    return res.status(200).json({
      found: true,
      violationId: violation.id,
      decision: {
        action: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        escalated: decision.escalate_to_human || false
      },
      message: 'Watermark detected. Violation logged and moderation action taken.'
    });
  } catch (err) {
    console.error('Leak analysis error:', err);
    return res.status(500).json({ error: 'Analysis failed' });
  }
};
