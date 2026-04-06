const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
const MAX_PHOTOS = 4;
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const MONTHLY_LIMIT = 10;

// ─── Claude Vision helper ───────────────────────────────────────

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

// ─── Layer 1: AI Generation Detection ───────────────────────────

async function checkAIGenerated(base64, mediaType) {
  const system = `You are an AI-generated image and photo manipulation detection specialist for a women's safety app. Analyze the provided photo and determine if it is AI-generated, heavily filtered, or digitally altered.

=== AI GENERATION DETECTION ===
CHECK FOR THESE AI GENERATION ARTIFACTS:
- Unnatural facial symmetry (real faces are always slightly asymmetric)
- Background warping, impossible architecture, or inconsistent perspective
- Hair anomalies (merged strands, floating hair, inconsistent edges, hair that fades into background)
- Ear shape anomalies (asymmetric, melted, missing details, different shapes left vs right)
- Skin that looks too smooth, waxy, plastic-like, or has repeating micro-patterns
- Eye reflections that don't match each other or the environment
- Teeth or mouth abnormalities (merged teeth, unnatural gum line, too-perfect teeth)
- Jewelry or accessories that warp, merge, or defy physics
- Hands with wrong number of fingers, merged digits, or impossible proportions
- Garbled or nonsensical text in background (signs, labels, clothing text)
- Overall "uncanny valley" quality — looks almost real but something feels off
- Inconsistent lighting direction across the face or body
- Perfectly smooth clothing without natural wrinkles or folds

CHECK FOR THESE AI MODELS SPECIFICALLY:
- StyleGAN / ThisPersonDoesNotExist artifacts (common: background blobs, asymmetric earrings, smeared backgrounds at edges)
- Midjourney artifacts (overly artistic quality, hyper-detailed skin, painterly look, unusual compositional perfection)
- DALL-E / Stable Diffusion artifacts (text distortion, floating objects, impossible hand poses)
- Face swap / deepfake artifacts (mismatched skin tone at face boundary, blurry face edge blending, inconsistent lighting between face and neck)

=== FILTER & ALTERATION DETECTION ===
CHECK FOR PHOTO MANIPULATION:
- Beauty filters: skin smoothing that erases pores and texture, enlarged eyes, slimmed nose or jaw, plumped lips
- Snapchat/Instagram/TikTok filters: dog ears, flower crowns, sparkles, but also subtle beauty filters that reshape the face
- FaceApp: age-change artifacts, gender-swap artifacts, heavy facial restructuring
- Facetune/Photoshop: body reshaping (look for warped backgrounds near body), skin retouching, teeth whitening
- Liquify tool: curved or warped lines in background near body (door frames, tiles, furniture edges bending)
- Color grading that obscures natural skin tone or hides details
- Heavy HDR or contrast that masks imperfections unnaturally
- Blurred or smudged areas that hide something specific

=== SEVERITY LEVELS ===
- "none": Unedited or only basic adjustments (brightness, crop, normal camera filters)
- "light": Minor beauty filter or standard social media filter — person likely looks similar in real life
- "moderate": Noticeable face reshaping, heavy skin smoothing, or body slimming — person may look different in real life
- "heavy": Major face/body alteration, face swap, or AI-generated — person may look very different or not exist at all

RESPOND WITH JSON ONLY:
{
  "likelyAIGenerated": true/false,
  "confidence": 0.0-1.0,
  "artifactsFound": ["list of specific artifacts detected"],
  "filterDetected": true/false,
  "filterType": "none|beauty_filter|faceapp|snapchat|instagram|facetune|face_swap|heavy_editing",
  "filterSeverity": "none|light|moderate|heavy",
  "alterationsFound": ["specific alterations detected, e.g. 'jaw slimming', 'skin smoothing', 'background warping near waist'"],
  "summary": "One sentence summary for the user"
}`;

  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: 'Analyze this photo for AI-generation artifacts. Is this a real photograph or AI-generated?' }
  ];

  return callClaudeVision(system, content, 400);
}

// ─── Layer 2: Multi-Photo Consistency ───────────────────────────

async function checkPhotoConsistency(images) {
  if (images.length < 2) {
    return { skipped: true, reason: 'Need at least 2 photos for consistency check' };
  }

  const system = `You are a facial consistency analysis specialist for a women's safety app. You are comparing multiple photos to determine if they all show the same person.

ANALYZE:
- Facial bone structure (jawline, cheekbones, nose shape, forehead)
- Facial proportions (distance between eyes, nose width, mouth width)
- Distinguishing marks (moles, scars, dimples, birthmarks, freckles)
- Age consistency (do all photos appear to be from the same rough time period?)
- Body type consistency (height, build, proportions)
- Ear shape (one of the most reliable identifiers)

ACCOUNT FOR:
- Different lighting and angles can change appearance
- Makeup can alter apparent features
- Weight changes happen over time
- Hair changes (color, length, style) don't mean different person
- Glasses on/off doesn't mean different person

BE CAREFUL:
- Siblings can look very similar — look for subtle structural differences
- Don't flag as different just because of angle or expression changes
- Focus on bone structure and proportions, not surface features

RESPOND WITH JSON ONLY:
{
  "samePerson": true/false/"uncertain",
  "confidence": 0.0-1.0,
  "matchingFeatures": ["list of matching features across photos"],
  "discrepancies": ["list of any discrepancies found"],
  "ageConsistency": true/false,
  "estimatedTimespanYears": 0,
  "summary": "One sentence for the user"
}`;

  var contentBlocks = [];
  for (var i = 0; i < images.length; i++) {
    contentBlocks.push({
      type: 'image',
      source: { type: 'base64', media_type: images[i].mediaType, data: images[i].base64 }
    });
    contentBlocks.push({
      type: 'text',
      text: 'Photo ' + (i + 1) + ' of ' + images.length
    });
  }
  contentBlocks.push({
    type: 'text',
    text: 'Compare all the photos above. Are they the same person? Note any discrepancies.'
  });

  return callClaudeVision(system, contentBlocks, 400);
}

// ─── Layer 3: Screenshot Detection + Analysis ───────────────────

async function detectIfScreenshot(base64, mediaType) {
  try {
    const result = await callClaudeVision(
      'Respond with JSON only. No other text.',
      [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
        { type: 'text', text: 'Is this image a screenshot of a dating app or social media profile? Respond with JSON only: {"isScreenshot": true/false}' }
      ],
      50
    );
    return result.isScreenshot === true;
  } catch (e) {
    return false;
  }
}

async function analyzeScreenshot(base64, mediaType) {
  const system = `You are a dating profile analysis specialist for a women's safety app. A user has uploaded a screenshot of someone's dating app profile. Analyze it for red flags and signs of inauthenticity.

ANALYZE THE PROFILE FOR:

PHOTO RED FLAGS:
- Photos that look professionally shot (model portfolio quality) for a regular person
- Photos that appear to be stock photos or downloaded from the internet
- Heavy filtering or face-altering edits
- All photos from the same angle/setting (may be limited to a few stolen photos)
- Photos where background appears warped near the body (liquify tool editing)
- Photos that appear to be from very different time periods
- Only 1-2 photos (low effort or limited stolen material)
- Group photos where it's unclear which person is the profile owner

BIO RED FLAGS:
- Overly generic bio ("just ask," "here for a good time," "love to travel and laugh")
- Mentions moving to another platform quickly ("message me on WhatsApp/Telegram/Snap")
- Claims to rarely use the app ("I'm never on here, message me at...")
- Mentions of investment, crypto, or business opportunities
- Love-bombing language combined with low profile effort
- Copy-paste feel (overly polished for a casual dating bio)
- Grammar/spelling patterns suggesting non-native English when profile claims to be local

CONVERSATION RED FLAGS (if messages are visible):
- Moving to another platform very quickly
- Asking for personal information early
- Excessive compliments or love-bombing
- Sob stories or requests for money/gift cards
- Refusing or avoiding video calls
- Sending overly sexual messages very early
- Pressure to meet at a private location

POSITIVE SIGNS:
- Verified badge from the dating app
- Multiple candid photos from different contexts
- Specific, personal bio details
- Connected Instagram or Spotify
- Natural conversation flow in messages

RESPOND WITH JSON ONLY:
{
  "overallRisk": "low|moderate|high",
  "confidence": 0.0-1.0,
  "platform": "tinder|hinge|bumble|other|unknown",
  "photoRedFlags": ["list of photo concerns"],
  "bioRedFlags": ["list of bio concerns"],
  "messageRedFlags": ["list of message concerns"],
  "positiveSignals": ["list of positive indicators"],
  "verificationBadgePresent": true/false/"unable_to_determine",
  "summary": "2-3 sentence summary for the user",
  "recommendations": ["list of specific recommendations"]
}`;

  const content = [
    { type: 'image', source: { type: 'base64', media_type: mediaType, data: base64 } },
    { type: 'text', text: 'Analyze this dating profile screenshot for red flags and authenticity concerns.' }
  ];

  return callClaudeVision(system, content, 500);
}

// ─── Orchestrator ───────────────────────────────────────────────

async function runPhotoVerification(images) {
  var results = {
    overallRisk: 'low',
    layers: {},
    recommendations: []
  };

  // Layer 1: AI Generation Check — run on each photo
  results.layers.aiGeneration = [];
  for (var i = 0; i < images.length; i++) {
    try {
      var aiCheck = await checkAIGenerated(images[i].base64, images[i].mediaType);
      aiCheck.photoIndex = i;
      results.layers.aiGeneration.push(aiCheck);
      if (aiCheck.likelyAIGenerated) {
        results.overallRisk = 'high';
        results.recommendations.push('One or more photos may be AI-generated. Exercise extreme caution.');
      }
      if (aiCheck.filterDetected && aiCheck.filterType !== 'none') {
        var severity = aiCheck.filterSeverity || 'moderate';
        if (severity === 'heavy') {
          results.overallRisk = 'high';
          results.recommendations.push('Heavy photo manipulation detected. This person may look very different in real life. Request a video call before meeting.');
        } else if (severity === 'moderate') {
          if (results.overallRisk === 'low') results.overallRisk = 'moderate';
          results.recommendations.push('Noticeable photo filtering detected (face reshaping or skin smoothing). The person may look different in real life.');
        } else if (severity === 'light') {
          results.recommendations.push('Minor beauty filter detected. This is common and the person likely looks similar in real life.');
        }
      }
      if (aiCheck.alterationsFound && aiCheck.alterationsFound.length > 0) {
        if (results.overallRisk === 'low' && aiCheck.alterationsFound.length >= 3) results.overallRisk = 'moderate';
      }
    } catch (e) {
      console.error('[PhotoVerify] AI gen check failed for photo ' + i + ':', e.message);
      results.layers.aiGeneration.push({ photoIndex: i, error: true, summary: 'Analysis failed for this photo' });
    }
  }

  // Layer 2: Consistency Check — run if 2+ photos
  if (images.length >= 2) {
    try {
      var consistencyCheck = await checkPhotoConsistency(images);
      results.layers.consistency = consistencyCheck;
      if (consistencyCheck.samePerson === false) {
        results.overallRisk = 'high';
        results.recommendations.push('Photos may not all be the same person. Ask for a video call to verify.');
      } else if (consistencyCheck.samePerson === 'uncertain') {
        if (results.overallRisk === 'low') results.overallRisk = 'moderate';
        results.recommendations.push('Some inconsistencies found between photos. Consider requesting additional verification.');
      }
    } catch (e) {
      console.error('[PhotoVerify] Consistency check failed:', e.message);
      results.layers.consistency = { error: true, summary: 'Consistency analysis failed' };
    }
  } else {
    results.layers.consistency = { skipped: true, reason: 'Need 2+ photos for consistency check' };
    results.recommendations.push('Upload multiple photos for a more thorough consistency check.');
  }

  // Layer 3: Screenshot Analysis — run on photos that appear to be screenshots
  results.layers.screenshot = [];
  for (var j = 0; j < images.length; j++) {
    try {
      var isScreenshot = await detectIfScreenshot(images[j].base64, images[j].mediaType);
      if (isScreenshot) {
        var screenshotResult = await analyzeScreenshot(images[j].base64, images[j].mediaType);
        screenshotResult.photoIndex = j;
        results.layers.screenshot.push(screenshotResult);
        if (screenshotResult.overallRisk === 'high') {
          results.overallRisk = 'high';
          if (screenshotResult.recommendations) {
            results.recommendations = results.recommendations.concat(screenshotResult.recommendations);
          }
        } else if (screenshotResult.overallRisk === 'moderate' && results.overallRisk === 'low') {
          results.overallRisk = 'moderate';
          if (screenshotResult.recommendations) {
            results.recommendations = results.recommendations.concat(screenshotResult.recommendations);
          }
        }
      }
    } catch (e) {
      console.error('[PhotoVerify] Screenshot analysis failed for photo ' + j + ':', e.message);
    }
  }

  // Layer 4: Reverse Image Search (Phase 2 — placeholder)
  results.layers.reverseSearch = {
    available: false,
    message: 'Reverse image search coming in a future update.',
    manualLinks: ['https://images.google.com', 'https://tineye.com']
  };

  // Universal safety recommendations
  if (results.overallRisk === 'high') {
    results.recommendations.push('Do not share personal information with this person until you can verify their identity.');
    results.recommendations.push('Use SafeTea Date Check-In if you do decide to meet.');
  }
  results.recommendations.push('Always meet in a public place for first dates.');

  // Deduplicate
  results.recommendations = Array.from(new Set(results.recommendations));

  // Delete all image data from memory
  for (var k = 0; k < images.length; k++) {
    images[k].base64 = null;
    images[k].buffer = null;
  }

  return results;
}

// ─── Request Handler ────────────────────────────────────────────

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Tier gate — SafeTea+ required (admins bypass)
  if (user.role !== 'admin' && (!user.subscription_tier || !['plus', 'pro', 'premium'].includes(user.subscription_tier))) {
    return res.status(403).json({
      error: 'Photo Verification requires SafeTea+ ($7.99/mo)',
      upgrade: true
    });
  }

  if (!ANTHROPIC_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  // Check monthly usage limit
  var currentMonth = new Date().toISOString().slice(0, 7); // "2026-04"
  var usage;
  try {
    usage = await getOne(
      'SELECT check_count, extra_checks FROM photo_verification_usage WHERE user_id = $1 AND check_month = $2',
      [user.id, currentMonth]
    );
  } catch (e) {
    // Table may not exist yet
    usage = null;
  }

  var currentCount = usage ? parseInt(usage.check_count, 10) : 0;
  var extraChecks = usage ? parseInt(usage.extra_checks || 0, 10) : 0;
  var totalLimit = MONTHLY_LIMIT + extraChecks;

  if (user.role !== 'admin' && currentCount >= totalLimit) {
    return res.status(429).json({
      error: 'monthly_limit_reached',
      checksUsed: currentCount,
      checksLimit: totalLimit,
      extraChecksAvailable: 0,
      canPurchaseMore: true,
      purchaseUrl: '/api/photos/purchase-check',
      packages: [
        { type: 'single', price: '$0.99', checks: 1, label: '1 Extra Photo Check — $0.99' },
        { type: '10pack', price: '$7.99', checks: 10, label: '10 Photo Checks — $7.99 (save ~$2)' },
      ],
      message: 'You\'ve used all your Photo Verification checks this month. Get more starting at $0.99 each, or save with a 10-pack for $7.99.'
    });
  }

  var body;
  try {
    body = await parseBody(req);
  } catch (e) {
    return res.status(400).json({ error: 'Invalid request body' });
  }

  var rawImages = body.images;
  if (!rawImages || !Array.isArray(rawImages) || rawImages.length === 0) {
    return res.status(400).json({ error: 'images array is required (1-4 base64 images)' });
  }
  if (rawImages.length > MAX_PHOTOS) {
    return res.status(400).json({ error: 'Maximum ' + MAX_PHOTOS + ' photos per check' });
  }

  // Validate and parse images
  var images = [];
  for (var i = 0; i < rawImages.length; i++) {
    var raw = rawImages[i];
    if (!raw) {
      return res.status(400).json({ error: 'Image ' + (i + 1) + ' is empty' });
    }

    // Strip data URL prefix if present
    var base64 = raw.replace(/^data:image\/\w+;base64,/, '');
    var buffer;
    try {
      buffer = Buffer.from(base64, 'base64');
    } catch (e) {
      return res.status(400).json({ error: 'Image ' + (i + 1) + ' is not valid base64' });
    }

    if (buffer.length > MAX_IMAGE_SIZE) {
      return res.status(400).json({ error: 'Image ' + (i + 1) + ' exceeds 10MB limit' });
    }

    // Detect media type
    var mediaType = 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) mediaType = 'image/png';
    else if (buffer[0] === 0xFF && buffer[1] === 0xD8) mediaType = 'image/jpeg';
    else if (buffer.length > 12 && buffer.slice(8, 12).toString() === 'WEBP') mediaType = 'image/webp';

    images.push({ base64: base64, mediaType: mediaType, buffer: buffer });
  }

  try {
    // Run the full verification
    var results = await runPhotoVerification(images);

    // Store report (results only, never images)
    var reportId = null;
    try {
      var report = await getOne(
        `INSERT INTO photo_verification_reports (user_id, photo_count, overall_risk, layers_json, recommendations_json, created_at)
         VALUES ($1, $2, $3, $4, $5, NOW()) RETURNING id`,
        [user.id, images.length, results.overallRisk, JSON.stringify(results.layers), JSON.stringify(results.recommendations)]
      );
      reportId = report.id;
    } catch (e) {
      console.error('[PhotoVerify] Failed to save report:', e.message);
    }

    // Increment usage counter
    try {
      await run(
        `INSERT INTO photo_verification_usage (user_id, check_month, check_count, last_check_at)
         VALUES ($1, $2, 1, NOW())
         ON CONFLICT (user_id, check_month) DO UPDATE SET check_count = photo_verification_usage.check_count + 1, last_check_at = NOW()`,
        [user.id, currentMonth]
      );
    } catch (e) {
      console.error('[PhotoVerify] Failed to update usage:', e.message);
    }

    return res.status(200).json({
      success: true,
      reportId: reportId,
      photoCount: images.length,
      overallRisk: results.overallRisk,
      layers: results.layers,
      recommendations: results.recommendations,
      checksUsed: currentCount + 1,
      checksRemaining: Math.max(0, totalLimit - (currentCount + 1)),
      checksLimit: totalLimit
    });
  } catch (err) {
    console.error('[PhotoVerify] Verification failed:', err);
    return res.status(500).json({ error: 'Analysis failed: ' + (err.message || 'Unknown error') });
  }
};