const { getOne, getMany, run } = require('../_utils/db');
const { sendWeeklyModReportEmail } = require('../../services/email');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify cron secret
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const isAuthorized = secret === process.env.CRON_SECRET || secret === process.env.MIGRATE_SECRET;
  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // Ensure table exists
    await run(`CREATE TABLE IF NOT EXISTS weekly_reports (
      id SERIAL PRIMARY KEY,
      week_label TEXT NOT NULL,
      report_text TEXT NOT NULL,
      raw_data JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Aggregate moderation data for the past 7 days
    const violations = await getMany(
      `SELECT type, status, COUNT(*)::int as count FROM violations
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY type, status`
    ).catch(function() { return []; });

    const modActions = await getMany(
      `SELECT action, COUNT(*)::int as count FROM moderation_logs
       WHERE created_at > NOW() - INTERVAL '7 days'
       GROUP BY action`
    ).catch(function() { return []; });

    const suspensions = await getMany(
      `SELECT id, ban_type, ban_reason, banned_at FROM users
       WHERE banned = true AND banned_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return []; });

    const liftedSuspensions = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE action = 'suspension_lifted' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    const photoStats = await getOne(
      `SELECT
         COUNT(*) FILTER (WHERE status = 'expired')::int as expired,
         COUNT(*) FILTER (WHERE status = 'active')::int as active
       FROM photos WHERE created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { expired: 0, active: 0 }; });

    const totalPosts = await getOne(
      `SELECT COUNT(*)::int as count FROM posts WHERE created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    const hiddenPosts = await getOne(
      `SELECT COUNT(*)::int as count FROM posts WHERE hidden = true AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    const appeals = await getMany(
      `SELECT status, COUNT(*)::int as count FROM appeals
       WHERE submitted_at > NOW() - INTERVAL '7 days'
       GROUP BY status`
    ).catch(function() { return []; });

    const nameBlocks = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE action = 'full_name_blocked' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    // Security metrics — watermark violations
    const watermarkViolations = await getMany(
      `SELECT target_id, details FROM moderation_logs
       WHERE action = 'watermark_violation' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return []; });

    // Defamation removals
    const defamationRemovals = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE action = 'defamation_removal' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    // Suspicious accounts flagged
    const suspiciousAccounts = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE action = 'suspicious_account' AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    // Trust score distribution
    const trustScoreDist = await getMany(
      `SELECT
         CASE
           WHEN trust_score >= 80 THEN 'high (80-100)'
           WHEN trust_score >= 50 THEN 'medium (50-79)'
           WHEN trust_score >= 30 THEN 'low (30-49)'
           ELSE 'critical (<30)'
         END as tier,
         COUNT(*)::int as count
       FROM users WHERE banned = false
       GROUP BY tier`
    ).catch(function() { return []; });

    // Ban appeals received (emails are external, track via moderation_logs)
    const banAppeals = await getOne(
      `SELECT COUNT(*)::int as count FROM moderation_logs
       WHERE action IN ('appeal_received', 'appeal_approved', 'appeal_denied')
       AND created_at > NOW() - INTERVAL '7 days'`
    ).catch(function() { return { count: 0 }; });

    const rawData = {
      violations: violations,
      moderation_actions: modActions,
      suspensions: suspensions.length,
      suspension_details: suspensions,
      lifted_suspensions: liftedSuspensions?.count || 0,
      photos: photoStats || { expired: 0, active: 0 },
      total_posts: totalPosts?.count || 0,
      hidden_posts: hiddenPosts?.count || 0,
      appeals: appeals,
      name_blocks: nameBlocks?.count || 0,
      security: {
        watermark_violations: watermarkViolations.length,
        watermark_details: watermarkViolations.map(function(w) {
          try { return JSON.parse(w.details); } catch(e) { return w.details; }
        }),
        defamation_removals: defamationRemovals?.count || 0,
        suspicious_accounts_flagged: suspiciousAccounts?.count || 0,
        trust_score_distribution: trustScoreDist,
        ban_appeals: banAppeals?.count || 0
      }
    };

    // Generate week label
    var now = new Date();
    var weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    var weekLabel = weekAgo.toISOString().split('T')[0] + ' to ' + now.toISOString().split('T')[0];

    // Generate report with Claude Sonnet
    var reportText = '';
    if (ANTHROPIC_KEY) {
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
            max_tokens: 1000,
            system: `You are SafeTea's report writer. Write a concise weekly moderation & security report for the admin team. Use plain text with clear sections and bullet points. Include a brief summary at the top, then break down each category. Include a SECURITY section covering watermark violations, defamation removals, suspicious accounts, and trust score distribution. Highlight any concerning trends or patterns that need admin attention. Keep the tone professional but friendly. Do not use markdown headers — use ALL CAPS for section titles.`,
            messages: [{
              role: 'user',
              content: 'Generate a weekly moderation report for SafeTea for the week of ' + weekLabel + '. Here is the raw data:\n\n' + JSON.stringify(rawData, null, 2)
            }]
          })
        });

        if (response.ok) {
          const data = await response.json();
          reportText = data.content?.[0]?.text || '';
        }
      } catch (aiErr) {
        console.error('[WeeklyReport] AI generation failed:', aiErr.message);
      }
    }

    // Fallback if AI failed
    if (!reportText) {
      reportText = 'WEEKLY MODERATION & SECURITY REPORT\n' + weekLabel + '\n\n'
        + 'SUMMARY\n'
        + '- Total posts: ' + rawData.total_posts + '\n'
        + '- Hidden/removed posts: ' + rawData.hidden_posts + '\n'
        + '- Violations reported: ' + violations.length + ' categories\n'
        + '- Suspensions issued: ' + rawData.suspensions + '\n'
        + '- Suspensions lifted: ' + rawData.lifted_suspensions + '\n'
        + '- Full name blocks: ' + rawData.name_blocks + '\n'
        + '- Photos uploaded: ' + (rawData.photos.active || 0) + ' active, ' + (rawData.photos.expired || 0) + ' expired\n'
        + '- Appeals: ' + appeals.map(function(a) { return a.status + ': ' + a.count; }).join(', ') + '\n\n'
        + 'SECURITY\n'
        + '- Watermark violations: ' + rawData.security.watermark_violations + '\n'
        + '- Defamation removals: ' + rawData.security.defamation_removals + '\n'
        + '- Suspicious accounts flagged: ' + rawData.security.suspicious_accounts_flagged + '\n'
        + '- Ban appeals: ' + rawData.security.ban_appeals + '\n'
        + '- Trust score distribution: ' + trustScoreDist.map(function(t) { return t.tier + ': ' + t.count; }).join(', ') + '\n';
    }

    // Save to database
    await run(
      `INSERT INTO weekly_reports (week_label, report_text, raw_data, created_at) VALUES ($1, $2, $3, NOW())`,
      [weekLabel, reportText, JSON.stringify(rawData)]
    );

    // Email to admin(s)
    const admins = await getMany(`SELECT email FROM users WHERE role = 'admin'`).catch(function() { return []; });
    for (const admin of admins) {
      await sendWeeklyModReportEmail(admin.email, reportText, weekLabel).catch(function(err) {
        console.error('[WeeklyReport] Email failed for', admin.email, err.message);
      });
    }

    return res.json({
      message: 'Weekly report generated',
      week_label: weekLabel,
      emailed_to: admins.length,
      report_length: reportText.length
    });
  } catch (err) {
    console.error('[WeeklyReport] Cron error:', err);
    return res.status(500).json({ error: 'Weekly report failed', details: err.message });
  }
};
