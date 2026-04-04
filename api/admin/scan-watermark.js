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
  const { image } = body; // base64 data URL or raw base64

  if (!image) {
    return res.status(400).json({ error: 'Missing image data' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    // Extract base64 and media type from data URL
    let base64Data = image;
    let mediaType = 'image/jpeg';
    if (image.startsWith('data:')) {
      const match = image.match(/^data:(image\/\w+);base64,(.+)$/);
      if (match) {
        mediaType = match[1];
        base64Data = match[2];
      }
    }

    // Send to Claude Vision to read watermark text
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 300,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mediaType, data: base64Data },
            },
            {
              type: 'text',
              text: 'This image may contain a faint, semi-transparent repeating watermark text pattern. Look very carefully for any text that follows the format "ST:" followed by a number (like "ST:9" or "ST:42" or "ST:12345"). The text may be very faint white text tiled diagonally across the image. Also look for text like "SafeTea #" followed by a number. Report ALL text patterns you find. Respond in this exact JSON format: {"viewer_watermark": "ST:NUMBER or null if not found", "upload_watermark": "SafeTea #NUMBER or null if not found", "confidence": "high/medium/low", "notes": "brief description of what you see"}'
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('Claude Vision error:', errText);
      return res.status(500).json({ error: 'AI scan failed', details: errText });
    }

    const result = await response.json();
    const aiText = result.content?.[0]?.text || '';

    // Try to parse JSON from AI response
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

    // Also try regex on raw text as fallback
    if (!viewerId) {
      const stMatch = aiText.match(/ST:(\d+)/);
      if (stMatch) viewerId = parseInt(stMatch[1]);
    }
    if (!uploaderId) {
      const safeMatch = aiText.match(/SafeTea\s*#(\d+)/i);
      if (safeMatch) uploaderId = parseInt(safeMatch[1]);
    }

    // Look up users if found
    const { getOne } = require('../_utils/db');
    let viewerUser = null;
    let uploaderUser = null;

    if (viewerId) {
      try {
        viewerUser = await getOne(
          'SELECT id, email, display_name, custom_display_name, city, tier, trust_score, warning_count, role FROM users WHERE id = $1',
          [viewerId]
        );
      } catch (e) {}
    }
    if (uploaderId) {
      try {
        uploaderUser = await getOne(
          'SELECT id, email, display_name, custom_display_name, city, tier, trust_score, warning_count, role FROM users WHERE id = $1',
          [uploaderId]
        );
      } catch (e) {}
    }

    return res.status(200).json({
      success: true,
      viewer: viewerId ? {
        userId: viewerId,
        found: !!viewerUser,
        user: viewerUser || null,
        watermark: 'ST:' + viewerId,
        type: 'viewer (who screenshotted/leaked)',
      } : null,
      uploader: uploaderId ? {
        userId: uploaderId,
        found: !!uploaderUser,
        user: uploaderUser || null,
        watermark: 'SafeTea #' + uploaderId,
        type: 'uploader (who posted the photo)',
      } : null,
      aiResponse: parsed || aiText,
      raw: aiText,
    });
  } catch (err) {
    console.error('Watermark scan error:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
};
