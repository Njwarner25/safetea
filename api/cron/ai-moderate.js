const { getMany, getOne, run } = require('../_utils/db');

// AI Auto-Moderator Cron
// Runs periodically to analyze unreviewed posts and enforce safety rules
// This ensures posts are moderated even when admins are offline

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are SafeTea's AI auto-moderator for a women's dating safety platform. You are analyzing community posts and chat messages that haven't been reviewed yet.

Respond ONLY with valid JSON:
{
  "credibility_score": 1-10,
  "flags": ["list of concerns"],
  "recommendation": "approve" | "review" | "flag_removal",
  "reasoning": "brief explanation",
  "action": null | "warn" | "remove" | "ban",
  "defamation_detected": false
}

Safety rules:
1. NO harassment, threats, doxxing, or targeted abuse
2. NO explicit sexual content or solicitation
3. NO spam, scams, or commercial promotion
4. NO false allegations without evidence
5. NO hate speech or discriminatory content
6. NO sharing personal info (phone numbers, addresses, full names of non-public figures)
7. NO DEFAMATION — This is critical. Auto-remove any post that:
   - Makes specific factual accusations about a named or identifiable real person (e.g. "he has a criminal record", "he gave me an STD", "he's a sex offender") WITHOUT verifiable evidence
   - Presents unverified claims as established fact rather than personal experience or opinion
   - Names someone's employer/workplace with intent to cause professional harm (tortious interference)
   - Coordinates pile-on targeting of a specific individual
   Note: Opinions and subjective experiences ARE allowed (e.g. "I felt unsafe", "bad vibes", "he ghosted me"). The distinction is between protected opinion and actionable defamation per se. Reference: AWDTSG case law — D'Ambrosio v. AWDTSG (N.D. Illinois 2024) established that opinions like "psycho" are protected, but specific false factual claims are not.
   Set "defamation_detected": true when defamatory content is found.
8. NO malicious accounts — Flag for ban if the post shows signs of:
   - Ban evasion (new account with same writing patterns as a banned user)
   - Fake/bot accounts (generic content, suspicious timing, promotional patterns)
   - Impersonation of other users or staff
   - Coordinated inauthentic behavior (multiple accounts pushing same narrative)

Scoring:
- 8-10: Genuine, helpful safety content → approve
- 5-7: Likely genuine, minor concerns → approve or review
- 3-4: Questionable content → review, consider warn
- 1-2: Clear violation → remove or ban

Auto-action rules:
- action: "remove" for clear doxxing, threats, explicit content, spam, defamation (score 1-3)
- action: "ban" for extreme harassment, threats of violence, malicious accounts (score 1-2 + severe violation)
- action: "warn" for minor rule violations, borderline defamation
- action: null for content that's fine or just needs human review`;

async function analyzeAndEnforce(post, source) {
  source = source || 'posts';
  try {
    const userInfo = await getOne(
      'SELECT display_name, warning_count, created_at FROM users WHERE id = $1',
      [post.user_id]
    );

    const reports = await getMany(
      'SELECT reason, details FROM post_reports WHERE post_id = $1 LIMIT 3',
      [post.id]
    );

    let context = `Post content: "${post.body}"\nCategory: ${post.category || 'general'}\nCity: ${post.city || 'unknown'}`;
    if (userInfo) {
      context += `\nUser: ${userInfo.display_name}, warnings: ${userInfo.warning_count || 0}, joined: ${userInfo.created_at}`;
    }
    if (reports.length > 0) {
      context += `\nReports (${reports.length}): ${reports.map(r => r.reason).join(', ')}`;
    }

    const resp = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${OPENAI_API_KEY}` },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: context }
        ],
        temperature: 0.2,
        max_tokens: 400
      })
    });

    const data = await resp.json();
    const raw = data.choices?.[0]?.message?.content || '';
    const result = JSON.parse(raw);

    // Store analysis — use correct table
    const table = source === 'room_posts' ? 'room_posts' : 'posts';
    await run(
      `UPDATE ${table} SET
        ai_credibility_score = $1,
        ai_flags = $2,
        ai_recommendation = $3,
        ai_reasoning = $4,
        ai_analyzed_at = NOW()
       WHERE id = $5`,
      [
        result.credibility_score || 5,
        result.flags || [],
        result.recommendation || 'review',
        result.reasoning || '',
        post.id
      ]
    );

    // Auto-enforce
    if (result.action === 'remove') {
      if (source === 'room_posts') {
        await run('UPDATE room_posts SET deleted_by_ai = true, is_flagged = true WHERE id = $1', [post.id]);
      } else {
        await run('UPDATE posts SET hidden = true, is_flagged = true WHERE id = $1', [post.id]);
      }

      const removalReason = result.defamation_detected
        ? `🚫 Your ${source === 'room_posts' ? 'chat message' : 'post'} was removed for containing defamatory content.\n\nReason: ${result.reasoning}\n\nSafeTea does not allow unverified factual accusations about identifiable individuals. Opinions and personal experiences are welcome, but presenting unverified claims as fact is not permitted.\n\nIf you believe this was a mistake, email support@getsafetea.app.`
        : `🤖 Your ${source === 'room_posts' ? 'chat message' : 'post'} was removed by SafeTea's AI safety system.\n\nReason: ${result.reasoning}\n\nContact support@getsafetea.app if you believe this was a mistake.`;

      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, removalReason]
      );

      // Log defamation removals specifically
      if (result.defamation_detected) {
        await run(
          `INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details, created_at)
           VALUES (0, 'defamation_removal', $1, $2, $3, NOW())`,
          [source === 'room_posts' ? 'room_post' : 'post', post.id, JSON.stringify({
            reasoning: result.reasoning,
            flags: result.flags,
            score: result.credibility_score,
            auto: true
          })]
        );
      }

      return { id: post.id, source, action: 'removed', score: result.credibility_score, defamation: !!result.defamation_detected };
    }

    if (result.action === 'ban') {
      if (source === 'room_posts') {
        await run('UPDATE room_posts SET deleted_by_ai = true, is_flagged = true WHERE id = $1', [post.id]);
      } else {
        await run('UPDATE posts SET hidden = true, is_flagged = true WHERE id = $1', [post.id]);
      }

      const banReason = result.reasoning || 'AI-detected severe violation';
      await run(
        `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent' WHERE id = $2`,
        [banReason, post.user_id]
      );
      await run('UPDATE posts SET hidden = true WHERE user_id = $1', [post.user_id]);
      await run('UPDATE room_posts SET deleted_by_ai = true WHERE author_id = $1', [post.user_id]);

      // Send inbox notification explaining the ban and that they can still use the app
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id,
         `🚫 ACCOUNT SUSPENDED — Community Feature Restricted\n\n` +
         `Your account has been suspended from SafeTea community features (posts, chats, rooms) due to a serious safety violation.\n\n` +
         `Reason: ${banReason}\n\n` +
         `You can still use SafeTea's safety tools (Date Check-in, SafeLink, SOS, Red Flag Scanner, etc.), but you will not be able to post or chat until the suspension is reviewed.\n\n` +
         `To appeal this decision, email support@getsafetea.app with your account email and a detailed explanation. Appeals are reviewed by SafeTea leadership and the final decision rests with SafeTea.\n\n` +
         `— SafeTea Safety Team`]
      );

      return { id: post.id, source, action: 'banned', score: result.credibility_score };
    }

    if (result.action === 'warn') {
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id,
         `⚠️ AI Safety Alert: Your ${source === 'room_posts' ? 'chat message' : 'post'} was flagged.\n\n` +
         `Reason: ${result.reasoning}\n\n` +
         `Please follow SafeTea community guidelines. Repeated violations may result in suspension from community features.\n\n` +
         `You can still use all of SafeTea's safety tools. If you have questions, email support@getsafetea.app.`]
      );
      return { id: post.id, source, action: 'warned', score: result.credibility_score };
    }

    // Flag low-scoring posts for admin review
    if (result.credibility_score <= 3) {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
    }

    return { id: post.id, action: 'analyzed', score: result.credibility_score, recommendation: result.recommendation };
  } catch (err) {
    console.error(`AI moderate error for post ${post.id}:`, err.message);
    return { id: post.id, action: 'error', error: err.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify cron secret or admin auth
  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const isAuthorized = secret === process.env.CRON_SECRET || secret === process.env.MIGRATE_SECRET;

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'OPENAI_API_KEY not configured' });
  }

  try {
    // Get unanalyzed posts (up to 20 per run to stay within API limits)
    const unanalyzed = await getMany(
      `SELECT id, body, category, city, user_id FROM posts
       WHERE ai_analyzed_at IS NULL AND hidden = false
       ORDER BY created_at DESC LIMIT 20`
    );

    // Also re-check reported posts that haven't been resolved
    const reported = await getMany(
      `SELECT DISTINCT p.id, p.body, p.category, p.city, p.user_id FROM posts p
       JOIN post_reports pr ON p.id = pr.post_id
       WHERE pr.reviewed = false AND p.hidden = false
       AND (p.ai_analyzed_at IS NULL OR p.ai_analyzed_at < NOW() - INTERVAL '1 hour')
       LIMIT 10`
    );

    // Also scan unreviewed room posts (chats)
    const roomUnanalyzed = await getMany(
      `SELECT id, body, type AS category, NULL AS city, author_id AS user_id FROM room_posts
       WHERE ai_analyzed_at IS NULL AND deleted_by_admin = false AND deleted_by_ai = false
       ORDER BY created_at DESC LIMIT 30`
    );

    const allPosts = [...unanalyzed, ...reported];
    // Deduplicate main posts
    const seen = new Set();
    const uniquePosts = allPosts.filter(p => {
      if (seen.has(p.id)) return false;
      seen.add(p.id);
      return true;
    });

    const results = [];
    for (const post of uniquePosts) {
      const result = await analyzeAndEnforce(post, 'posts');
      results.push(result);
      // Small delay to avoid rate limiting
      await new Promise(r => setTimeout(r, 200));
    }

    // Process room posts
    for (const rp of roomUnanalyzed) {
      const result = await analyzeAndEnforce(rp, 'room_posts');
      results.push(result);
      await new Promise(r => setTimeout(r, 200));
    }

    // Malicious account detection — check for suspicious new accounts
    let suspiciousAccounts = 0;
    try {
      const newAccounts = await getMany(
        `SELECT u.id, u.display_name, u.email, u.created_at, u.warning_count,
                COUNT(p.id)::int as post_count,
                COUNT(DISTINCT p.city)::int as city_count
         FROM users u
         LEFT JOIN posts p ON p.user_id = u.id AND p.created_at > NOW() - INTERVAL '24 hours'
         WHERE u.created_at > NOW() - INTERVAL '48 hours'
           AND u.banned = false
         GROUP BY u.id
         HAVING COUNT(p.id) > 5 OR COUNT(DISTINCT p.city) > 3`
      ).catch(function() { return []; });

      for (const acct of newAccounts) {
        // Flag accounts that posted in many cities or posted excessively within 48 hours of creation
        await run(
          `INSERT INTO moderation_logs (admin_id, action, target_type, target_id, details, created_at)
           VALUES (0, 'suspicious_account', 'user', $1, $2, NOW())`,
          [acct.id, JSON.stringify({
            reason: 'New account with suspicious activity pattern',
            post_count_24h: acct.post_count,
            cities_posted: acct.city_count,
            created_at: acct.created_at,
            auto: true
          })]
        );
        suspiciousAccounts++;
      }
    } catch (e) {
      console.error('[AI Moderate] Suspicious account scan error:', e.message);
    }

    const removed = results.filter(r => r.action === 'removed').length;
    const banned = results.filter(r => r.action === 'banned').length;
    const warned = results.filter(r => r.action === 'warned').length;
    const analyzed = results.filter(r => r.action === 'analyzed').length;
    const errors = results.filter(r => r.action === 'error').length;
    const defamation = results.filter(r => r.defamation).length;

    return res.json({
      message: `AI moderation complete: ${uniquePosts.length + roomUnanalyzed.length} posts/chats processed`,
      stats: { removed, banned, warned, analyzed, errors, defamation_removed: defamation, suspicious_accounts: suspiciousAccounts },
      results
    });
  } catch (err) {
    console.error('AI moderate cron error:', err);
    return res.status(500).json({ error: 'AI moderation failed', details: err.message });
  }
};
