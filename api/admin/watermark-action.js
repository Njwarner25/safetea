const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne, getMany } = require('../_utils/db');

/**
 * POST /api/admin/watermark-action
 * Auto-enforce when a watermark scan identifies a screenshot leaker.
 *
 * Body: { viewerId, uploaderId, evidence (text), imageUrl (optional) }
 *
 * Policy:
 *   - 1st offense: 7-day suspension + warning
 *   - 2nd offense: 30-day suspension
 *   - 3rd offense: permanent ban
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await authenticate(req);
  if (!admin || (admin.role !== 'admin' && admin.role !== 'moderator')) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const body = await parseBody(req);
  const { viewerId, uploaderId, evidence, imageUrl } = body;

  if (!viewerId) {
    return res.status(400).json({ error: 'viewerId is required (the user who took the screenshot)' });
  }

  try {
    // Look up the leaker
    const viewer = await getOne('SELECT id, display_name, custom_display_name, email, banned, warning_count FROM users WHERE id = $1', [viewerId]);
    if (!viewer) return res.status(404).json({ error: 'Viewer user not found' });

    // Count prior watermark violations
    const priorViolations = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE target_id = $1 AND target_type = 'user' AND action = 'watermark_violation'`,
      [viewerId]
    );
    const offenseNumber = (priorViolations ? priorViolations.count : 0) + 1;

    let action, duration, reason, banType;

    if (offenseNumber === 1) {
      action = 'suspend_7d';
      duration = 7;
      banType = 'temporary';
      reason = 'Unauthorized screenshot/sharing of SafeTea content detected via watermark. This is your first violation — 7-day suspension.';
    } else if (offenseNumber === 2) {
      action = 'suspend_30d';
      duration = 30;
      banType = 'temporary';
      reason = 'Repeat unauthorized screenshot/sharing detected via watermark. This is your second violation — 30-day suspension.';
    } else {
      action = 'permanent_ban';
      duration = null;
      banType = 'permanent';
      reason = 'Multiple unauthorized screenshot/sharing violations detected via watermark. Permanent ban issued per SafeTea privacy policy.';
    }

    // Apply suspension/ban
    if (banType === 'temporary') {
      await run(
        `UPDATE users SET banned = true, ban_type = 'temporary', ban_reason = $1, ban_until = NOW() + INTERVAL '${duration} days', last_warned_at = NOW(), warning_count = warning_count + 1 WHERE id = $2`,
        [reason, viewerId]
      );
    } else {
      await run(
        `UPDATE users SET banned = true, ban_type = 'permanent', ban_reason = $1, ban_until = NULL WHERE id = $2`,
        [reason, viewerId]
      );
    }

    // Hide all posts from banned user
    await run('UPDATE posts SET hidden = true WHERE user_id = $1', [viewerId]);

    // Log the moderation action
    await run(
      `INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details, created_at)
       VALUES ($1, 'watermark_violation', 'user', $2, $3, NOW())`,
      [admin.id, viewerId, JSON.stringify({
        offense_number: offenseNumber,
        enforcement: action,
        duration_days: duration,
        evidence: evidence || null,
        image_url: imageUrl || null,
        viewer_id: viewerId,
        uploader_id: uploaderId || null
      })]
    );

    // Send inbox notification to the violator
    try {
      await run(
        `INSERT INTO messages (sender_id, recipient_id, body, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [admin.id, viewerId,
         '⚠️ PRIVACY VIOLATION NOTICE — Community Features Restricted\n\n' + reason + '\n\n' +
         'SafeTea uses invisible watermarking to protect user privacy. Sharing screenshots of private content violates our Terms of Service.\n\n' +
         'You can still use SafeTea\'s safety tools (SafeTea check-in, SafeLink, SOS, Conversation Scanner, Catfish Scanner) during your suspension.\n\n' +
         'To appeal this decision, email support@getsafetea.app with your account email and a detailed explanation. Appeals are reviewed by SafeTea leadership.\n\n' +
         '— SafeTea Safety Team']
      );
    } catch (e) { /* non-blocking */ }

    // Send email notification if SendGrid is configured
    try {
      const emailService = require('../services/email');
      if (emailService && emailService.sendEmail && viewer.email) {
        await emailService.sendEmail({
          to: viewer.email,
          subject: 'SafeTea Account ' + (banType === 'permanent' ? 'Banned' : 'Suspended') + ' — Privacy Violation',
          html: '<h2>Privacy Violation — ' + (banType === 'permanent' ? 'Account Banned' : duration + '-Day Suspension') + '</h2>' +
            '<p>' + reason + '</p>' +
            '<p>SafeTea uses invisible watermarking technology to protect user privacy. Unauthorized sharing of screenshots is a serious violation of our Terms of Service.</p>' +
            '<p><strong>To appeal:</strong> Email <a href="mailto:support@getsafetea.app">support@getsafetea.app</a> with your account email and a detailed explanation. Appeals are reviewed by the SafeTea team, and the final decision rests with SafeTea leadership.</p>' +
            '<p>— SafeTea Safety Team</p>'
        });
      }
    } catch (e) { console.error('[WatermarkAction] Email failed:', e.message); }

    return res.status(200).json({
      success: true,
      offenseNumber,
      action,
      durationDays: duration,
      banType,
      viewerId,
      viewerName: viewer.custom_display_name || viewer.display_name,
      message: `Offense #${offenseNumber}: ${action} applied to user ${viewerId}`
    });
  } catch (err) {
    console.error('[WatermarkAction] Error:', err);
    return res.status(500).json({ error: 'Failed to process watermark action', details: err.message });
  }
};
