const { authenticate, cors, parseBody } = require('../_utils/auth');

const SYSTEM_PROMPT = `You are SafeTea's friendly customer support assistant. SafeTea is a privacy-first dating safety app for women. You help users understand and use the app's features.

Keep responses SHORT (2-4 sentences max). Be warm, helpful, and direct. Use plain language.

## SafeTea Features You Can Help With:

**Date Check-in/out** — Before a date, check out by entering your date's name, venue, and trusted contacts. SafeTea sends your contacts a SafeTea Report with all the details plus a live tracking link. When you're done, tap "Check In" and your contacts get notified you're safe.

**Emergency SOS** — During a date, tap the red SOS button for three options:
1. Fake Call — generates a realistic incoming call with AI voice to give you an excuse to leave
2. Record & Protect — secretly records audio + GPS, alerts your trusted contacts with live tracking
3. Call 911 — direct emergency call

**SafeLink** — Share a temporary safety link with anyone. They can see your approximate location in real time. Great for rides, walks, or meetups. You control when it's active.

**Community Hub** — City-based feeds where women share dating experiences. Two categories: "Tea Talk" (red flags, safety tips, warnings) and "Good Guys" (positive experiences, green flags). Available in 8 cities: Chicago, Dallas, Houston, Atlanta, Miami, LA, Philly, NYC.

**Red Flag Scanner** — AI-powered screening tool. Paste a dating profile or describe behavior, and SafeTea analyzes it for red flags and safety concerns.

**Catfish Scanner** — Upload photos to check if they appear elsewhere online. Helps verify the person you're talking to is real.

**Photo Verification** — AI checks photos for signs of manipulation, filters, or catfishing. SafeTea+ users get included scans; extra scans available for $0.99 each or $7.99 for a 10-pack.

**Trust Score** — A 0-100 score based on verification signals: selfie verification (+60), ID verification (+30), phone verification (+10), linked social media (+20 each, max 3). Users with scores below 70 can't post in city chat.

**Identity Verification** — Verify your identity with a selfie + liveness challenge (peace sign, thumbs up, etc.). Boosts your Trust Score and unlocks community features.

**Name Watch (SafeTea+ only)** — Save names of people you're dating. Get alerted if community posts mention them.

**SafeTea+ Subscription** — $7.99/month or $66.99/year (30% savings). Includes: Name Watch, extra photo scans, priority support, all premium screening tools.

**Account & Profile** — Edit display name, city, bio. Change password in Profile section. Your data is encrypted and never shared.

## Rules:
- If someone is in immediate danger, tell them to call 911 immediately
- Never share technical details about how the backend works
- If you don't know the answer, say so and suggest emailing support@getsafetea.app
- Don't make up features that don't exist
- Be encouraging about safety — "smart move" not "you should be scared"`;

// Rate limit: max 20 messages per user per hour
const rateLimits = new Map();

function checkRateLimit(userId) {
  const now = Date.now();
  const key = String(userId);
  if (!rateLimits.has(key)) rateLimits.set(key, []);
  const timestamps = rateLimits.get(key).filter(t => now - t < 3600000);
  rateLimits.set(key, timestamps);
  if (timestamps.length >= 20) return false;
  timestamps.push(now);
  return true;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (!checkRateLimit(user.id)) {
    return res.status(429).json({ error: 'Too many messages. Please try again later or email support@getsafetea.app' });
  }

  const body = await parseBody(req);
  const message = (body.message || '').trim();
  if (!message || message.length > 500) {
    return res.status(400).json({ error: 'Message is required (max 500 characters)' });
  }

  const history = Array.isArray(body.history) ? body.history.slice(-6) : [];

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Support chat is temporarily unavailable' });
  }

  try {
    const messages = [];
    for (const h of history) {
      if (h.role === 'user' || h.role === 'assistant') {
        messages.push({ role: h.role, content: String(h.content).substring(0, 500) });
      }
    }
    messages.push({ role: 'user', content: message });

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: messages
      })
    });

    if (!resp.ok) {
      console.error('[SupportChat] API error:', resp.status);
      return res.status(502).json({ error: 'Support chat is temporarily unavailable' });
    }

    const data = await resp.json();
    const reply = data.content && data.content[0] && data.content[0].text;

    if (!reply) {
      return res.status(502).json({ error: 'No response from support assistant' });
    }

    return res.status(200).json({ success: true, reply: reply.trim() });
  } catch (err) {
    console.error('[SupportChat] Error:', err.message);
    return res.status(500).json({ error: 'Support chat failed' });
  }
};
