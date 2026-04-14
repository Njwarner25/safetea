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
      text: 'You are analyzing a screenshot from the SafeTea app to identify WHO took the screenshot (the leaker).\n\n' +
        'SafeTea embeds the VIEWER\'s user ID into every photo using 3 layers of invisible watermarks:\n\n' +
        'LAYER 1 — EDGE STRIP (check first, most reliable): A semi-transparent dark strip along the BOTTOM EDGE of the photo ' +
        'containing repeated white monospace text "ST:" followed by a number. This is the viewer user ID. ' +
        'Example: "ST:2" or "ST:42" or "ST:307". The strip spans the full width.\n\n' +
        'LAYER 2 — CORNER MARKERS (check second): Small "ST:NUMBER" text in all 4 corners of the image.\n\n' +
        'LAYER 3 — TILED DIAGONAL (check third): The same "ST:NUMBER" text is tiled diagonally across the entire image at very low opacity.\n\n' +
        'UPLOAD WATERMARK: The uploader\'s ID appears as "SafeTea #NUMBER" tiled diagonally (separate from the ST: viewer watermark).\n\n' +
        'Image 1 (binary/thresholded): High-contrast black/white — watermark text appears as white on black. ' +
        'CHECK THE BOTTOM EDGE FIRST for the strip watermark. Then check corners. Then look for tiled patterns.\n\n' +
        (softImage ? 'Image 2 (amplified grayscale): Same watermark with more gradation — use to confirm.\n\n' : '') +
        (rawImage ? 'Image ' + (softImage ? '3' : '2') + ' (original photo): Look for the faint bottom strip and "SafeTea #" text.\n\n' : '') +
        'PRIORITY ORDER:\n' +
        '1. Bottom edge strip — look for repeated "ST:NUMBER" text along the bottom\n' +
        '2. Corner text — check all 4 corners for "ST:NUMBER"\n' +
        '3. Tiled diagonal — look for repeating patterns in uniform color areas\n' +
        '4. Upload watermark — look for "SafeTea #NUMBER" anywhere\n\n' +
        'The ST:NUMBER identifies the VIEWER (the person who took the screenshot). This is the most important piece of information.\n\n' +
        'Respond ONLY with this JSON (no markdown):\n' +
        '{"viewer_watermark": "ST:NUMBER or null", "upload_watermark": "SafeTea #NUMBER or null", "confidence": "high/medium/low", "notes": "what you see and where"}\n\n' +
        'Report ANY text you can read, even partially. A partial read with low confidence is better than null.'
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
