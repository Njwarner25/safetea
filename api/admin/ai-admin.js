const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

const SYSTEM_PROMPT = `You are SafeTea's AI Admin Assistant. SafeTea is a women's dating safety platform with community posts, referral posts, rooms, and safety tools.

You help admins with:
1. Reviewing reported content and recommending moderation actions
2. Analyzing user behavior and risk levels
3. Answering questions about users, posts, reports, and platform activity

When reviewing reports, respond with JSON:
{
  "action": "dismiss" | "warn" | "suspend_7d" | "ban",
  "confidence": 0-100,
  "reasoning": "brief explanation",
  "risk_factors": ["list of concerns"]
}

For general questions, respond in plain text with clear, actionable insights.

Guidelines:
- Harassment, threats, doxxing → ban
- Explicit content, scams → suspend_7d or ban based on severity
- Minor guideline violations → warn
- False/frivolous reports → dismiss
- Consider user history: prior warnings, trust score, account age
- Be decisive but fair. Protect community safety above all.`;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured (ANTHROPIC_API_KEY missing)' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = await parseBody(req);
  const { action, data } = body;

  if (!action) return res.status(400).json({ error: 'action is required' });

  try {
    if (action === 'scan_watermark') {
      return await handleScanWatermark(res, data);
    } else if (action === 'review_report') {
      return await handleReviewReport(res, data, user);
    } else if (action === 'bulk_review') {
      return await handleBulkReview(res, data, user);
    } else if (action === 'ask') {
      return await handleAsk(res, data, user);
    } else {
      return res.status(400).json({ error: 'Unknown action: ' + action });
    }
  } catch (err) {
    console.error('AI admin error:', err);
    return res.status(500).json({ error: 'AI admin action failed: ' + err.message });
  }
};

// ===== SCAN WATERMARK =====
// Decodes steganographic watermark from a post's image to identify the viewer who captured/shared it
async function handleScanWatermark(res, data) {
  if (!data || !data.report_id) {
    return res.status(400).json({ error: 'report_id is required' });
  }

  // Get the reported post's image
  const report = await getOne(
    `SELECT pr.id, pr.post_id, pr.reason, pr.details,
            p.image_url, p.body, p.user_id as post_author_id
     FROM post_reports pr
     JOIN posts p ON pr.post_id = p.id
     WHERE pr.id = $1`,
    [data.report_id]
  );

  if (!report) return res.status(404).json({ error: 'Report not found' });
  if (!report.image_url) return res.status(400).json({ error: 'Reported post has no image — watermark scanning requires a photo post' });

  // The watermark decoding happens client-side since we need canvas pixel access.
  // Server returns the image data for the admin client to decode.
  return res.json({
    report_id: report.id,
    post_id: report.post_id,
    image_url: report.image_url,
    post_body: report.body,
    post_author_id: report.post_author_id,
    message: 'Image returned for client-side watermark decoding'
  });
}

// ===== REVIEW REPORT =====
async function handleReviewReport(res, data, adminUser) {
  if (!data || !data.report_id) {
    return res.status(400).json({ error: 'report_id is required' });
  }

  const report = await getOne(
    `SELECT pr.id, pr.post_id, pr.reason, pr.details, pr.reporter_id, pr.created_at,
            p.body as post_body, p.category, p.city, p.user_id as author_id, p.image_url,
            u.display_name, u.custom_display_name, u.warning_count, u.trust_score, u.created_at as user_created
     FROM post_reports pr
     JOIN posts p ON pr.post_id = p.id
     JOIN users u ON p.user_id = u.id
     WHERE pr.id = $1`,
    [data.report_id]
  );

  if (!report) return res.status(404).json({ error: 'Report not found' });

  // Get user's report history
  const priorReports = await getMany(
    `SELECT pr.reason, pr.created_at
     FROM post_reports pr JOIN posts p ON pr.post_id = p.id
     WHERE p.user_id = $1 ORDER BY pr.created_at DESC LIMIT 10`,
    [report.author_id]
  );

  const priorBans = await getMany(
    'SELECT reason, duration_days, created_at FROM user_bans WHERE user_id = $1 ORDER BY created_at DESC LIMIT 5',
    [report.author_id]
  );

  const userContext = `
User: ${report.custom_display_name || report.display_name || 'Anonymous'} (ID: ${report.author_id})
Trust Score: ${report.trust_score || 'N/A'}
Warnings: ${report.warning_count || 0}
Account Created: ${report.user_created}
Prior Reports Against Them: ${priorReports.length} (${priorReports.map(r => r.reason).join(', ') || 'none'})
Prior Bans: ${priorBans.length} (${priorBans.map(b => b.reason + ' (' + b.duration_days + 'd)').join(', ') || 'none'})`;

  const prompt = `Review this reported post and recommend a moderation action.

Post Content: "${report.post_body}"
Category: ${report.category}
City: ${report.city || 'unknown'}
Has Image: ${report.image_url ? 'yes' : 'no'}

Report Reason: ${report.reason}
Report Details: ${report.details || 'none'}
Reported: ${report.created_at}

${userContext}

Respond with JSON only.`;

  const aiResponse = await callClaude(prompt);

  let decision;
  try {
    decision = JSON.parse(aiResponse);
  } catch (e) {
    decision = { action: 'review', confidence: 0, reasoning: aiResponse, risk_factors: [] };
  }

  // Log the AI decision
  await run(
    `INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [adminUser.id, 'ai_review', 'report', data.report_id, JSON.stringify(decision)]
  ).catch(() => {});

  return res.json({
    report_id: data.report_id,
    post_id: report.post_id,
    author_id: report.author_id,
    author_name: report.custom_display_name || report.display_name,
    post_body: report.post_body,
    report_reason: report.reason,
    ai_decision: decision
  });
}

// ===== BULK REVIEW =====
async function handleBulkReview(res, data, adminUser) {
  const limit = (data && data.limit) || 10;

  const reports = await getMany(
    `SELECT pr.id, pr.post_id, pr.reason, pr.details, pr.created_at,
            p.body as post_body, p.category, p.city, p.user_id as author_id, p.image_url,
            u.display_name, u.custom_display_name, u.warning_count, u.trust_score
     FROM post_reports pr
     JOIN posts p ON pr.post_id = p.id
     JOIN users u ON p.user_id = u.id
     WHERE pr.reviewed = false OR pr.reviewed IS NULL
     ORDER BY pr.created_at ASC
     LIMIT $1`,
    [limit]
  );

  if (!reports || reports.length === 0) {
    return res.json({ results: [], message: 'No unreviewed reports' });
  }

  const results = [];
  for (const report of reports) {
    const prompt = `Quickly review this reported post. Respond with JSON: {"action":"dismiss"|"warn"|"suspend_7d"|"ban","confidence":0-100,"reasoning":"brief"}

Post: "${(report.post_body || '').substring(0, 500)}"
Report reason: ${report.reason}
User warnings: ${report.warning_count || 0}, trust score: ${report.trust_score || 'N/A'}`;

    try {
      const aiResponse = await callClaude(prompt);
      let decision;
      try {
        decision = JSON.parse(aiResponse);
      } catch (e) {
        decision = { action: 'review', confidence: 0, reasoning: aiResponse };
      }

      results.push({
        report_id: report.id,
        post_id: report.post_id,
        author_id: report.author_id,
        author_name: report.custom_display_name || report.display_name,
        post_body: (report.post_body || '').substring(0, 200),
        report_reason: report.reason,
        has_image: !!report.image_url,
        ai_decision: decision
      });
    } catch (err) {
      results.push({
        report_id: report.id,
        post_id: report.post_id,
        error: err.message
      });
    }
  }

  // Log bulk review
  await run(
    `INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details, created_at)
     VALUES ($1, $2, $3, $4, $5, NOW())`,
    [adminUser.id, 'ai_bulk_review', 'reports', 0, JSON.stringify({ count: results.length })]
  ).catch(() => {});

  return res.json({ results });
}

// ===== ASK (free-form) =====
async function handleAsk(res, data, adminUser) {
  if (!data || !data.question) {
    return res.status(400).json({ error: 'question is required' });
  }

  // Gather context based on the question
  let context = '';

  // If question mentions a user ID, fetch their info
  const userIdMatch = data.question.match(/user\s*#?(\d+)/i);
  if (userIdMatch) {
    const uid = userIdMatch[1];
    const targetUser = await getOne(
      `SELECT id, display_name, custom_display_name, email, city, tier, role, trust_score, warning_count, created_at
       FROM users WHERE id = $1`,
      [uid]
    );
    if (targetUser) {
      const reportCount = await getOne(
        'SELECT COUNT(*) as count FROM post_reports pr JOIN posts p ON pr.post_id = p.id WHERE p.user_id = $1',
        [uid]
      );
      context += `\nUser #${uid}: ${targetUser.custom_display_name || targetUser.display_name}, email: ${targetUser.email}, city: ${targetUser.city}, tier: ${targetUser.tier}, trust_score: ${targetUser.trust_score}, warnings: ${targetUser.warning_count}, reports: ${reportCount?.count || 0}, joined: ${targetUser.created_at}`;
    }
  }

  // Get platform stats for context
  const stats = await getOne(
    `SELECT
       (SELECT COUNT(*) FROM users) as total_users,
       (SELECT COUNT(*) FROM posts) as total_posts,
       (SELECT COUNT(*) FROM post_reports WHERE reviewed = false OR reviewed IS NULL) as pending_reports`
  );
  if (stats) {
    context += `\nPlatform: ${stats.total_users} users, ${stats.total_posts} posts, ${stats.pending_reports} pending reports`;
  }

  const prompt = `Admin question: ${data.question}
${context ? '\nContext:' + context : ''}

Provide a helpful, concise answer. If the question is about moderation, be decisive and safety-focused.`;

  const aiResponse = await callClaude(prompt);

  return res.json({ answer: aiResponse });
}

// ===== CLAUDE API HELPER =====
async function callClaude(userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errData = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errData);
  }

  const result = await response.json();
  return result.content?.[0]?.text || '';
}
