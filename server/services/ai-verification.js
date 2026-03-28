const OpenAI = require('openai');
const { getOne, getAll, query } = require('../db/database');

let openai = null;
function getClient() {
  if (!openai && process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

const SYSTEM_PROMPT = `You are a content moderation analyst for a dating safety platform. Analyze the following community post for credibility and potential abuse.

Your job is to PROTECT both the community (from false info) and the subjects of posts (from harassment and false accusations).

Evaluate:
1. Specificity: Does the post contain verifiable details? (dates, locations, apps, events)
2. Language: Does the writing read like a genuine personal experience?
3. Patterns: Does this appear to be part of a coordinated campaign against one person?
4. Proportionality: Is the concern raised proportional to what is described?
5. Red flags for abuse: revenge language, threats, doxxing attempts, personal info exposure

Respond ONLY in JSON with no preamble or markdown:
{"credibility_score": 7, "flags": ["list of specific concerns or empty array"], "recommendation": "approve", "reasoning": "2-3 sentence explanation", "similar_posts_detected": false, "specific_details_present": true}

The recommendation field must be one of: "approve", "review", "flag_removal"
The credibility_score must be an integer from 1 to 10.`;

async function analyzePost(postId, content, city, userId) {
  try {
    const client = getClient();
    if (!client) {
      console.warn('[AI Verification] OPENAI_API_KEY not set, skipping analysis');
      return;
    }

    // Gather related posts (same city, last 30 days)
    const relatedPosts = await getAll(
      `SELECT content, created_at FROM posts
       WHERE city = $1 AND id != $2
       AND created_at >= NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC LIMIT 10`,
      [city, postId]
    );

    const relatedPostsText = relatedPosts.length > 0
      ? relatedPosts.map(p => `- "${p.content.substring(0, 200)}" (${new Date(p.created_at).toLocaleDateString()})`).join('\n')
      : 'No other recent posts in this city.';

    // Gather account info
    const accountInfo = await getOne(
      `SELECT u.created_at as account_created, u.role,
              (SELECT COUNT(*) FROM posts WHERE user_id = u.id) as post_count
       FROM users u WHERE u.id = $1`,
      [userId]
    );

    const accountAge = accountInfo
      ? Math.floor((Date.now() - new Date(accountInfo.account_created).getTime()) / (1000 * 60 * 60 * 24))
      : 0;

    const accountInfoText = accountInfo
      ? `Account age: ${accountAge} days, Total posts: ${accountInfo.post_count}, Role: ${accountInfo.role}`
      : 'Account info unavailable';

    const userPrompt = `Post content: "${content}"

Context — other posts about the same person if any: ${relatedPostsText}
Account age and post history: ${accountInfoText}`;

    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      max_tokens: 1000,
      temperature: 0.3,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: userPrompt }
      ],
      response_format: { type: 'json_object' }
    });

    const rawText = response.choices[0].message.content;
    const analysis = JSON.parse(rawText);

    // Validate required fields
    const score = Math.max(1, Math.min(10, parseInt(analysis.credibility_score) || 5));
    const flags = Array.isArray(analysis.flags) ? analysis.flags : [];
    const recommendation = ['approve', 'review', 'flag_removal'].includes(analysis.recommendation)
      ? analysis.recommendation
      : 'review';
    const reasoning = typeof analysis.reasoning === 'string'
      ? analysis.reasoning.substring(0, 1000)
      : '';

    // Store results
    await query(
      `UPDATE posts SET
        ai_credibility_score = $1,
        ai_flags = $2,
        ai_recommendation = $3,
        ai_reasoning = $4,
        ai_analyzed_at = NOW()
       WHERE id = $5`,
      [score, flags, recommendation, reasoning, postId]
    );

    console.log(`[AI Verification] Post ${postId}: score=${score}, recommendation=${recommendation}`);
  } catch (err) {
    console.error(`[AI Verification] Failed for post ${postId}:`, err.message);
  }
}

module.exports = { analyzePost };
