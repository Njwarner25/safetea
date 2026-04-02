const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { recalculateTrustScore } = require('../_utils/trust-score');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const ALLOWED_PLATFORMS = ['instagram', 'tiktok', 'twitter', 'linkedin', 'facebook', 'snapchat'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = await parseBody(req);
  const { platform, platform_user_id, platform_username, account_age_months, follower_count, bio, profile_photo_base64 } = body;

  if (!platform || !ALLOWED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'Invalid platform. Allowed: ' + ALLOWED_PLATFORMS.join(', ') });
  }
  if (!platform_username) {
    return res.status(400).json({ error: 'platform_username is required' });
  }

  // Check if already connected
  const existing = await getOne(
    'SELECT id, verified FROM connected_accounts WHERE user_id = $1 AND platform = $2',
    [user.id, platform]
  );
  if (existing) {
    return res.status(409).json({ error: 'Platform already connected', verified: existing.verified });
  }

  // Check max 3 connected accounts
  const countResult = await getOne(
    'SELECT COUNT(*) as count FROM connected_accounts WHERE user_id = $1',
    [user.id]
  );
  if (parseInt(countResult.count) >= 3) {
    return res.status(400).json({ error: 'Maximum 3 social accounts allowed' });
  }

  try {
    // AI legitimacy check
    let verified = false;
    let flagged = false;
    let aiConfidence = 0;
    let aiReason = '';

    if (ANTHROPIC_KEY) {
      const profileData = {
        platform,
        username: platform_username,
        account_age_months: account_age_months || 'unknown',
        follower_count: follower_count || 'unknown',
        bio: bio || 'none provided'
      };

      const content = [
        { type: 'text', text: 'Review this social media profile for legitimacy:\n\n' + JSON.stringify(profileData, null, 2) }
      ];

      // If profile photo provided, include it for visual analysis
      if (profile_photo_base64) {
        const base64 = profile_photo_base64.replace(/^data:image\/\w+;base64,/, '');
        content.unshift({
          type: 'image',
          source: { type: 'base64', media_type: 'image/jpeg', data: base64 }
        });
      }

      const aiRes = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': ANTHROPIC_KEY,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 200,
          system: 'You are reviewing a social media profile to determine if it is a legitimate, established account. Respond with JSON only.\n\nCHECK FOR:\n- Is the account established (not freshly created)? Accounts < 3 months old are suspicious.\n- Does the follower count suggest a real person (not 0 followers, not a purchased account)?\n- Does the bio seem like a real person?\n- Any red flags: stock photo patterns, empty profiles, bot characteristics?\n\nRESPOND WITH:\n{"legitimate": true/false, "confidence": 0.0-1.0, "reason": "brief explanation"}',
          messages: [{ role: 'user', content }]
        })
      });

      if (aiRes.ok) {
        const aiData = await aiRes.json();
        const text = aiData.content?.[0]?.text || '';
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const result = JSON.parse(jsonMatch[0]);
          aiConfidence = result.confidence || 0;
          aiReason = result.reason || '';
          verified = result.legitimate === true && aiConfidence >= 0.7;
          flagged = result.legitimate === false || aiConfidence < 0.7;
        }
      }
    } else {
      // No AI key — auto-verify based on basic heuristics
      verified = (account_age_months || 0) >= 3 && (follower_count || 0) >= 5;
      flagged = !verified;
      aiReason = 'No AI review — basic heuristic check';
      aiConfidence = verified ? 0.75 : 0.3;
    }

    // Insert connected account (profile_photo_base64 is NOT stored)
    await run(
      `INSERT INTO connected_accounts (user_id, platform, platform_user_id, platform_username, account_age_months, follower_count, verified, flagged, ai_confidence, ai_reason, verified_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)`,
      [
        user.id, platform, platform_user_id || null, platform_username,
        account_age_months || null, follower_count || null,
        verified, flagged, aiConfidence, aiReason,
        verified ? new Date().toISOString() : null
      ]
    );

    // Recalculate trust score
    const newScore = await recalculateTrustScore(user.id, 'social_connected', 'social_' + platform);

    return res.status(201).json({
      success: true,
      platform,
      verified,
      flagged,
      confidence: aiConfidence,
      reason: aiReason,
      trustScore: newScore
    });
  } catch (err) {
    console.error('[ConnectSocial] Error:', err);
    return res.status(500).json({ error: 'Failed to connect social account' });
  }
};
