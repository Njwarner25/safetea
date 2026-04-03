const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { run, getOne } = require('../../_utils/db');
const { recalculateTrustScore } = require('../../_utils/trust-score');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

// Liveness challenges — user must match one of these
const CHALLENGES = [
  { id: 'peace', instruction: 'Hold up a peace sign (two fingers) next to your face', check: 'Is the person holding up a peace sign (two fingers / V sign) near their face?' },
  { id: 'thumbsup', instruction: 'Give a thumbs up next to your face', check: 'Is the person giving a thumbs up near their face?' },
  { id: 'wave', instruction: 'Wave at the camera with your hand visible', check: 'Is the person waving with their hand clearly visible?' },
  { id: 'palm', instruction: 'Hold your open palm flat next to your face', check: 'Is the person holding an open palm flat near their face?' }
];

async function callClaudeVision(systemPrompt, contentBlocks, maxTokens) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': ANTHROPIC_KEY,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens || 400,
      system: systemPrompt,
      messages: [{ role: 'user', content: contentBlocks }]
    })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + err.substring(0, 200));
  }

  const data = await response.json();
  const text = data.content?.[0]?.text || '';
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON in Claude response');
  return JSON.parse(jsonMatch[0]);
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // GET = get a liveness challenge
  if (req.method === 'GET') {
    const challenge = CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
    return res.status(200).json({
      challenge_id: challenge.id,
      instruction: challenge.instruction
    });
  }

  // POST = submit selfie for verification
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'AI verification service not configured' });
  }

  // Check if already verified
  const fullUser = await getOne(
    'SELECT identity_verified, age_verified, gender_verified FROM users WHERE id = $1',
    [user.id]
  );
  if (fullUser && fullUser.identity_verified) {
    return res.status(200).json({ already_verified: true, message: 'Identity already verified' });
  }

  const body = await parseBody(req);
  const { selfie, challenge_id } = body;

  if (!selfie) {
    return res.status(400).json({ error: 'Selfie image required (base64)' });
  }
  if (!challenge_id) {
    return res.status(400).json({ error: 'Challenge ID required' });
  }

  const challenge = CHALLENGES.find(c => c.id === challenge_id);
  if (!challenge) {
    return res.status(400).json({ error: 'Invalid challenge ID' });
  }

  // Strip data URL prefix
  const base64 = selfie.replace(/^data:image\/\w+;base64,/, '');
  let buffer;
  try {
    buffer = Buffer.from(base64, 'base64');
  } catch (e) {
    return res.status(400).json({ error: 'Invalid base64 image' });
  }

  if (buffer.length > 10 * 1024 * 1024) {
    return res.status(400).json({ error: 'Image exceeds 10MB limit' });
  }

  // Detect media type
  let mediaType = 'image/jpeg';
  if (buffer[0] === 0x89 && buffer[1] === 0x50) mediaType = 'image/png';
  else if (buffer.length > 12 && buffer.slice(8, 12).toString() === 'WEBP') mediaType = 'image/webp';

  try {
    const systemPrompt = `You are a selfie verification specialist for SafeTea, a women's safety app. Your job is to verify that the person in the photo is a real, live human being taking a real-time selfie — NOT a photo of a photo, a screenshot, an AI-generated image, or a deepfake.

VERIFY THESE THINGS:

1. LIVENESS: ${challenge.check}
2. REAL PHOTO: Is this a genuine camera selfie (not a photo of a screen, printed photo, or screenshot)?
3. REAL PERSON: Is this a real human face (not AI-generated, not a mask, not a mannequin)?
4. SINGLE PERSON: Is there exactly one primary face in the selfie?

RED FLAGS:
- Moire patterns (screen photographed from another screen)
- Rectangular borders or bezels visible (photo of a phone/monitor)
- Unnatural smoothness or AI artifacts
- No visible skin texture or pores at all
- Perfect symmetry (AI generation indicator)
- Background looks like a printed backdrop

RESPOND WITH JSON ONLY:
{
  "isLivePerson": true/false,
  "challengePassed": true/false,
  "isRealPhoto": true/false,
  "isAIGenerated": true/false,
  "isPhotoOfPhoto": true/false,
  "confidence": 0.0-1.0,
  "issues": ["list of any issues found"],
  "summary": "One sentence explanation"
}`;

    const content = [
      { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
      { type: 'text', text: 'Verify this selfie. The user was asked to: ' + challenge.instruction }
    ];

    const result = await callClaudeVision(systemPrompt, content, 400);

    // Clear image data from memory
    buffer = null;

    const passed = result.isLivePerson && result.challengePassed && result.isRealPhoto && !result.isAIGenerated && !result.isPhotoOfPhoto && result.confidence >= 0.6;

    // Ensure verification data columns exist
    try {
      await run(`ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS details JSONB`);
      await run(`ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS challenge_id VARCHAR(20)`);
      await run(`ALTER TABLE verification_attempts ADD COLUMN IF NOT EXISTS selfie_data TEXT`);
    } catch (e) { /* columns may already exist */ }

    // Log the attempt with full details
    try {
      await run(
        `INSERT INTO verification_attempts (user_id, type, result, provider, challenge_id, details, selfie_data)
         VALUES ($1, 'identity', $2, 'claude-vision', $3, $4, $5)`,
        [user.id, passed ? 'passed' : 'failed', challenge_id, JSON.stringify(result), base64]
      );
    } catch (e) {
      // Fallback without new columns if migration hasn't run
      try {
        await run(
          `INSERT INTO verification_attempts (user_id, type, result, provider) VALUES ($1, 'identity', $2, 'claude-vision')`,
          [user.id, passed ? 'passed' : 'failed']
        );
      } catch (e2) { console.error('[Verify] Failed to log attempt:', e2.message); }
    }

    if (passed) {
      // Mark identity as verified
      await run('UPDATE users SET identity_verified = true WHERE id = $1', [user.id]);

      // Check if fully verified now
      const updated = await getOne(
        'SELECT age_verified, identity_verified, gender_verified FROM users WHERE id = $1',
        [user.id]
      );
      const fullyVerified = updated.age_verified && updated.identity_verified && updated.gender_verified;
      if (fullyVerified) {
        await run('UPDATE users SET is_verified = true, verified_at = NOW() WHERE id = $1', [user.id]);
      }

      // Recalculate trust score after identity verification
      recalculateTrustScore(user.id, 'identity_verified', 'verification').catch(function(e) {
        console.error('[TrustScore] Recalc failed after identity verify:', e.message);
      });

      return res.status(200).json({
        verified: true,
        fullyVerified,
        confidence: result.confidence,
        summary: result.summary,
        nextStep: fullyVerified ? null : (!updated.gender_verified ? 'gender' : null)
      });
    } else {
      return res.status(200).json({
        verified: false,
        confidence: result.confidence,
        issues: result.issues || [],
        summary: result.summary || 'Verification failed. Please try again.',
        challengePassed: result.challengePassed,
        isLivePerson: result.isLivePerson,
        isRealPhoto: result.isRealPhoto
      });
    }
  } catch (err) {
    console.error('Identity verification error:', err);
    return res.status(500).json({ error: 'Verification failed. Please try again.' });
  }
};
