/**
 * Full Name Detection Utility
 * Uses Claude Sonnet to detect full first+last name pairs in post text.
 * Blocks posts that contain full names to protect privacy.
 */

const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;

async function checkForFullNames(postText) {
  if (!ANTHROPIC_KEY) {
    console.log('[NameBlock] ANTHROPIC_API_KEY not configured — fail open');
    return { fullNameDetected: false, detectedNames: [], suggestion: '' };
  }

  if (!postText || postText.trim().length < 3) {
    return { fullNameDetected: false, detectedNames: [], suggestion: '' };
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
        max_tokens: 300,
        system: `You are a privacy protection filter for SafeTea, a dating safety platform. Your job is to detect full names (first name + last name) in user posts.

DETECT (flag these):
- Full first + last name pairs: "John Smith", "Marcus Johnson", "Sarah Williams"
- Names with middle initials: "John A. Smith", "Marcus T. Johnson"
- Names with middle names: "John Andrew Smith"

DO NOT FLAG (allow these):
- First name only: "Jake", "Sarah", "Marcus"
- First name + last initial: "Jake M.", "Sarah W.", "Marcus J."
- Usernames or handles: "@jakesmith", "user123"
- Celebrity/public figure names used in general context (e.g. "like a Taylor Swift concert")
- Business names or place names: "Johnson Park", "Smith & Co"
- Clearly fictional names or example names

Respond with ONLY a JSON object:
{"fullNameDetected": true/false, "detectedNames": ["list of detected full names"], "suggestion": "rewritten version using first name + last initial, or empty string if none detected"}

If multiple names detected, include all in detectedNames and provide suggestions for all.`,
        messages: [{
          role: 'user',
          content: `Scan this post for full names:\n\n"${postText}"`
        }]
      })
    });

    if (!response.ok) {
      console.error('[NameBlock] Claude API error:', response.status);
      return { fullNameDetected: false, detectedNames: [], suggestion: '' };
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.error('[NameBlock] Could not parse AI response');
      return { fullNameDetected: false, detectedNames: [], suggestion: '' };
    }

    const result = JSON.parse(jsonMatch[0]);
    return {
      fullNameDetected: !!result.fullNameDetected,
      detectedNames: result.detectedNames || [],
      suggestion: result.suggestion || ''
    };
  } catch (err) {
    console.error('[NameBlock] Error:', err.message);
    return { fullNameDetected: false, detectedNames: [], suggestion: '' };
  }
}

module.exports = { checkForFullNames };
