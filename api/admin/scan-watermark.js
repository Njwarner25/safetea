const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user || (user.role !== 'admin' && user.role !== 'moderator')) {
    return res.status(403).json({ error: 'Admin access required' });
  }

  const body = await parseBody(req);
  // image = thresholded binary (black/white, watermark text as white on black)
  // softImage = softer amplification with more context
  // rawImage = original screenshot (upload watermark "SafeTea #X" visible)
  const { image, softImage, rawImage } = body;

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  function extractBase64(dataUrl) {
    let base64 = dataUrl;
    let media = 'image/jpeg';
    if (dataUrl.startsWith('data:')) {
      const m = dataUrl.match(/^data:(image\/\w+);base64,(.+)$/);
      if (m) { media = m[1]; base64 = m[2]; }
    }
    return { base64, media };
  }

  try {
    // Build message with multiple processed versions for best detection
    const content = [];

    // Thresholded binary image (clearest for text detection)
    const thresh = extractBase64(image);
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: thresh.media, data: thresh.base64 },
    });

    // Softer amplification (more context/gradation)
    if (softImage) {
      const soft = extractBase64(softImage);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: soft.media, data: soft.base64 },
      });
    }

    // Raw image for upload watermark
    if (rawImage) {
      const raw = extractBase64(rawImage);
      content.push({
        type: 'image',
        source: { type: 'base64', media_type: raw.media, data: raw.base64 },
      });
    }

    content.push({
      type: 'text',
      text: 'You are analyzing a screenshot from the SafeTea app for invisible watermarks.\n\n' +
        'The watermark is semi-transparent white text with a subtle dark outline, tiled diagonally across photos. ' +
        'The format is "ST:" followed by a number (the viewer user ID), and also "SafeTea #" followed by a number (the uploader ID).\n\n' +
        'Image 1 (binary/thresholded): White text on black background, upscaled 2x. The text is in bold monospace font. ' +
        'Each tile contains EXACTLY the same short string: "ST:" followed by a small number (1-999). ' +
        'For example: "ST:2" or "ST:14" or "ST:307".\n\n' +
        (softImage ? 'Image 2 (amplified grayscale): Same watermark with more gradation — use to confirm your reading.\n\n' : '') +
        (rawImage ? 'Image ' + (softImage ? '3' : '2') + ' (original photo): Look for a faint "SafeTea #" followed by a number.\n\n' : '') +
        'DETECTION TIPS:\n' +
        '1. Look at areas with uniform color (sky, walls, solid clothing) where text is most visible\n' +
        '2. Look for repeating diagonal patterns of characters\n' +
        '3. The text repeats many times — look for ANY instance you can partially read\n' +
        '4. Even if you can only read part of the number, report what you see\n' +
        '5. Focus on Image 1 first (binary) — find the clearest text instance\n\n' +
        'Respond ONLY with this JSON (no markdown):\n' +
        '{"viewer_watermark": "ST:NUMBER or null", "upload_watermark": "SafeTea #NUMBER or null", "confidence": "high/medium/low", "notes": "what you see"}\n\n' +
        'If you can see ANY repeating pattern that looks like text, even partially readable, set viewer_watermark to your best reading with low confidence.'
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 500,
        messages: [{ role: 'user', content }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude Vision error:', errText);
      return res.status(500).json({ error: 'AI scan failed', details: errText });
    }

    const result = await response.json();
    const aiText = result.content?.[0]?.text || '';

    // Parse JSON from AI response
    let parsed = null;
    try {
      const jsonMatch = aiText.match(/\{[\s\S]*\}/);
      if (jsonMatch) parsed = JSON.parse(jsonMatch[0]);
    } catch (e) {}

    // Extract user IDs
    let viewerId = null;
    let uploaderId = null;

    if (parsed) {
      if (parsed.viewer_watermark) {
        const vmatch = parsed.viewer_watermark.match(/ST:(\d+)/);
        if (vmatch) viewerId = parseInt(vmatch[1]);
      }
      if (parsed.upload_watermark) {
        const umatch = parsed.upload_watermark.match(/#(\d+)/);
        if (umatch) uploaderId = parseInt(umatch[1]);
      }
    }

    // Fallback regex on raw text
    if (!viewerId) {
      const stMatch = aiText.match(/ST:(\d+)/);
      if (stMatch) viewerId = parseInt(stMatch[1]);
    }
    if (!uploaderId) {
      const safeMatch = aiText.match(/SafeTea\s*#(\d+)/i);
      if (safeMatch) uploaderId = parseInt(safeMatch[1]);
    }

    // Look up users
    const { getOne } = require('../_utils/db');
    let viewerUser = null;
    let uploaderUser = null;

    let viewerDbError = null;
    let uploaderDbError = null;

    if (viewerId) {
      try {
        viewerUser = await getOne(
          'SELECT id, email, display_name, custom_display_name, city, subscription_tier, trust_score, role FROM users WHERE id = $1',
          [viewerId]
        );
      } catch (e) {
        console.error('Viewer user lookup failed:', e.message);
        viewerDbError = e.message;
      }
    }
    if (uploaderId) {
      try {
        uploaderUser = await getOne(
          'SELECT id, email, display_name, custom_display_name, city, subscription_tier, trust_score, role FROM users WHERE id = $1',
          [uploaderId]
        );
      } catch (e) {
        console.error('Uploader user lookup failed:', e.message);
        uploaderDbError = e.message;
      }
    }

    return res.status(200).json({
      success: true,
      viewer: viewerId ? {
        userId: viewerId,
        found: !!viewerUser,
        user: viewerUser || null,
        watermark: 'ST:' + viewerId,
        type: 'viewer (who screenshotted/leaked)',
        dbError: viewerDbError || undefined,
      } : null,
      uploader: uploaderId ? {
        userId: uploaderId,
        found: !!uploaderUser,
        user: uploaderUser || null,
        watermark: 'SafeTea #' + uploaderId,
        type: 'uploader (who posted the photo)',
        dbError: uploaderDbError || undefined,
      } : null,
      aiResponse: parsed || aiText,
      raw: aiText,
    });
  } catch (err) {
    console.error('Watermark scan error:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
};
