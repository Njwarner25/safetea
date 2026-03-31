const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

// AI Admin — automated rule enforcement
// Reviews reported posts and applies actions based on severity

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

const SYSTEM_PROMPT = `You are SafeTea's AI moderator. SafeTea is a women's dating safety platform.

You are reviewing a reported community post. Analyze it for violations of these rules:
1. NO harassment, threats, doxxing, or targeted abuse
2. NO explicit sexual content or solicitation
3. NO spam, scams, or commercial promotion
4. NO false allegations without evidence
5. NO hate speech or discriminatory content
6. NO personal information sharing (phone numbers, addresses, full names of non-public figures)

Respond ONLY with valid JSON:
{
  "action": "approve" | "warn" | "remove" | "ban",
  "severity": 1-10,
  "reason": "brief explanation",
  "warning_message": "message to send to user if action is warn (null otherwise)"
}

- approve: post is fine, dismiss the report
- warn: minor violation, send warning to user
- remove: clear violation, hide the post
- ban: severe or repeated violation, ban the user`;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (!OPENAI_API_KEY) {
    return res.status(503).json({ error: 'AI service not configured' });
  }

  if (req.method === 'POST') {
    // Review a specific post
    try {
      const body = await parseBody(req);
      const { post_id } = body;

      if (!post_id) return res.status(400).json({ error: 'post_id is required' });

      const post = await getOne(
        `SELECT p.id, p.body, p.category, p.city, p.user_id, p.created_at,
                u.display_name, u.custom_display_name, u.warning_count
         FROM posts p JOIN users u ON p.user_id = u.id
         WHERE p.id = $1`,
        [post_id]
      );
      if (!post) return res.status(404).json({ error: 'Post not found' });

      // Get report context
      const reports = await getMany(
        'SELECT reason, details FROM post_reports WHERE post_id = $1 LIMIT 5',
        [post_id]
      );

      const reportContext = reports.length > 0
        ? '\n\nReport reasons: ' + reports.map(r => r.reason + (r.details ? ' — ' + r.details : '')).join('; ')
        : '';

      const userContext = `\nUser: ${post.custom_display_name || post.display_name || 'Anonymous'}, warnings: ${post.warning_count || 0}`;

      const aiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${OPENAI_API_KEY}`
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: `Post content: "${post.body}"\nCategory: ${post.category}\nCity: ${post.city || 'unknown'}${userContext}${reportContext}` }
          ],
          temperature: 0.2,
          max_tokens: 500
        })
      });

      const aiData = await aiResponse.json();
      const content = aiData.choices?.[0]?.message?.content || '';

      let decision;
      try {
        decision = JSON.parse(content);
      } catch (e) {
        return res.status(500).json({ error: 'AI returned invalid response', raw: content });
      }

      // Return the AI recommendation — admin can choose to apply it
      return res.json({
        post_id,
        post_body: post.body,
        ai_decision: decision,
        user_id: post.user_id,
        user_name: post.custom_display_name || post.display_name
      });
    } catch (err) {
      console.error('AI enforce error:', err);
      return res.status(500).json({ error: 'AI review failed' });
    }
  }

  // POST /api/admin/ai-enforce/apply — apply AI decision
  if (req.method === 'PUT') {
    try {
      const body = await parseBody(req);
      const { post_id, action, reason, warning_message } = body;

      if (!post_id || !action) return res.status(400).json({ error: 'post_id and action required' });

      const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [post_id]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      if (action === 'approve') {
        // Dismiss reports
        await run('UPDATE post_reports SET status = $1 WHERE post_id = $2', ['dismissed', post_id]);
        return res.json({ message: 'Post approved, reports dismissed' });
      }

      if (action === 'warn') {
        await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
        await run(
          `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
          [post.user_id, warning_message || `⚠️ Warning: Your post has been flagged for review.\n\nReason: ${reason}\n\nPlease follow the community guidelines.`]
        );
        await run('UPDATE post_reports SET status = $1 WHERE post_id = $2', ['resolved', post_id]);
        return res.json({ message: 'Warning sent to user' });
      }

      if (action === 'remove') {
        await run('UPDATE posts SET hidden = true WHERE id = $1', [post_id]);
        await run(
          `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
          [post.user_id, `🚫 Your post has been removed by SafeTea moderation.\n\nReason: ${reason}\n\nRepeated violations may result in account suspension.`]
        );
        await run('UPDATE post_reports SET status = $1 WHERE post_id = $2', ['resolved', post_id]);
        return res.json({ message: 'Post removed, user notified' });
      }

      if (action === 'ban') {
        await run(
          `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent' WHERE id = $2`,
          [reason || 'Severe community guideline violation', post.user_id]
        );
        await run('UPDATE posts SET hidden = true WHERE user_id = $1', [post.user_id]);
        await run(
          `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
          [post.user_id, `⛔ Your account has been suspended.\n\nReason: ${reason}\n\nContact support@getsafetea.app if you believe this is a mistake.`]
        );
        await run('UPDATE post_reports SET status = $1 WHERE post_id = $2', ['resolved', post_id]);
        return res.json({ message: 'User banned, posts hidden' });
      }

      return res.status(400).json({ error: 'Invalid action' });
    } catch (err) {
      console.error('AI enforce apply error:', err);
      return res.status(500).json({ error: 'Failed to apply action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
