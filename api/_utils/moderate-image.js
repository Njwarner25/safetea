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
        max_tokens: 240,
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

REJECT if any of the following apply:
- Nudity or sexual content
- Graphic violence
- Personal identifying documents (IDs, licenses, SSN cards)
- Photos of minors
- Hate symbols
- Content designed to harass or doxx someone (photos of someone's home, car with plates visible, workplace)
- DATING APP PROFILE SCREENSHOTS — visible UI of Tinder, Hinge, Bumble, Match, OkCupid, Coffee Meets Bagel, Plenty of Fish, Grindr, Feeld, BLK, etc. (profile cards, swipe buttons, "Like/Pass", chat list, match notifications)
- THIRD-PARTY SOCIAL MEDIA SCREENSHOTS featuring another person — visible UI of Instagram, Facebook, TikTok, Snapchat, X/Twitter, LinkedIn profile pages of someone other than the uploader
- A face-only or upper-body PHOTO OF ANOTHER PERSON without clear context that the uploader owns or has consent for the image (i.e., looks like it was taken from someone's social media or dating profile rather than captured in person)

APPROVE if: a selfie of the uploader, the uploader's own posed photo, photos of locations / venues / streets, screenshots of TEXT-ONLY messages (no profile photos visible), receipts / tickets, or other clearly safe content the uploader plausibly created themselves.

When in doubt about whether the photo is the uploader's own image vs. lifted from someone else's account, REJECT and use category "third_party_photo".

Respond with JSON only:
{"approved": true/false, "reason": "brief reason", "category": "safe|nudity|violence|doxxing|minor|hate|dating_profile|third_party_photo|other"}`
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
