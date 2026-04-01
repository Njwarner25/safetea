/**
 * AI-powered image moderation using Claude Vision.
 * Checks uploaded photos for prohibited content before posting.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function moderateImage(base64Image, mediaType) {
  if (!ANTHROPIC_KEY) {
    console.log('[Moderation] ANTHROPIC_API_KEY not configured — skipping image moderation');
    return { approved: true, reason: 'moderation_not_configured', category: 'safe' };
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_KEY,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: mediaType || 'image/jpeg',
                data: base64Image
              }
            },
            {
              type: 'text',
              text: `You are a content moderation AI for a women's safety app called SafeTea. Analyze this image and determine if it should be allowed.

REJECT if: nudity or sexual content, graphic violence, personal identifying documents (IDs, licenses, SSN cards), photos of minors, hate symbols, or content that appears designed to harass or doxx someone (photos of someone's home, car with plates visible, workplace).

APPROVE if: dating app screenshots, text conversations, restaurant/location photos, selfies, or general safe content.

Respond with JSON only:
{"approved": true/false, "reason": "brief reason", "category": "safe|nudity|violence|doxxing|minor|hate|other"}`
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      console.error('[Moderation] Claude API error:', response.status);
      // Fail open — allow upload if moderation API fails
      return { approved: true, reason: 'moderation_api_error', category: 'safe' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';

    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { approved: true, reason: 'moderation_parse_error', category: 'safe' };
    }

    return JSON.parse(jsonMatch[0]);
  } catch (err) {
    console.error('[Moderation] Image moderation failed:', err.message);
    // Fail open
    return { approved: true, reason: 'moderation_error', category: 'safe' };
  }
}

module.exports = { moderateImage };
