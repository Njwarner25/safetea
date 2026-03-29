const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');
const { checkRateLimit, getClientIP } = require('../../services/rateLimit');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Rate limit: 20 scans per hour per user, 5 per minute per IP
  const ipLimited = await checkRateLimit(getClientIP(req), 'redflag_ip', 5, 60);
  const userLimited = await checkRateLimit(String(user.id), 'redflag_user', 20, 3600);
  if (ipLimited || userLimited) {
    return res.status(429).json({ error: 'Too many scans. Please wait a few minutes before trying again.' });
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const { conversationText, textImages } = body;

  // Need at least conversation text or screenshot images
  if (!conversationText && (!textImages || textImages.length === 0)) {
    return res.status(400).json({ error: 'Please provide conversation text or upload screenshots' });
  }

  const OPENAI_KEY = process.env.OPENAI_API_KEY;
  if (!OPENAI_KEY) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    // Build the GPT-4o prompt
    const systemPrompt = `You are SafeTea's AI Red Flag Scanner — a dating safety tool for women. You analyze text conversations between a woman and a man she's dating or talking to.

Your job: Identify the man's likely motives, manipulation tactics, and behavioral patterns from the conversation.

ANALYSIS CATEGORIES:
- RED FLAGS (🚩): Manipulation, love-bombing, gaslighting, pressure tactics, boundary violations, controlling behavior, dishonesty patterns, isolation attempts, aggression, objectification, future-faking
- YELLOW FLAGS (🟡): Inconsistencies worth watching, mild pressure, vague answers, deflection, moving too fast, excessive flattery that feels performative, testing boundaries subtly
- GREEN FLAGS (💚): Respectful communication, clear consent, honest answers, appropriate pace, genuine interest in her life/feelings, accountability, emotional maturity

RESPONSE FORMAT (JSON):
{
  "overall_rating": "safe" | "caution" | "danger",
  "risk_score": 0-100,
  "summary": "2-3 sentence plain-language assessment of his motives",
  "motive_assessment": "What he likely wants based on the conversation patterns",
  "red_flags": [{ "flag": "short title", "detail": "explanation with quote from convo", "severity": "critical|high|medium" }],
  "yellow_flags": [{ "flag": "short title", "detail": "explanation with quote from convo" }],
  "green_flags": [{ "flag": "short title", "detail": "explanation with quote from convo" }],
  "safety_tips": ["actionable tip 1", "actionable tip 2"],
  "manipulation_tactics": ["named tactic if detected, e.g. Love Bombing, Gaslighting, Future Faking"]
}

RULES:
- Be direct and honest. This is a safety tool — don't sugarcoat danger.
- Quote specific messages when flagging something.
- If the conversation is clearly dangerous (threats, coercion), say so plainly.
- If the conversation seems healthy, say that too — don't manufacture red flags.
- Score: 0-20 = safe, 21-40 = mostly safe, 41-60 = caution, 61-80 = concerning, 81-100 = danger
- Always respond with valid JSON only, no markdown.`;

    // Build messages array
    const messages = [{ role: 'system', content: systemPrompt }];

    // If text screenshots are provided, use GPT-4o vision
    if (textImages && textImages.length > 0) {
      const content = [
        { type: 'text', text: 'Analyze this dating conversation for red flags, yellow flags, and green flags. Identify his motives and any manipulation tactics.' + (conversationText ? '\n\nAdditional context from the user: ' + conversationText : '') }
      ];

      // Add up to 5 images
      const images = textImages.slice(0, 5);
      for (const img of images) {
        if (img.startsWith('data:')) {
          content.push({ type: 'image_url', image_url: { url: img, detail: 'high' } });
        }
      }

      messages.push({ role: 'user', content: content });
    } else {
      messages.push({
        role: 'user',
        content: 'Analyze this dating conversation for red flags, yellow flags, and green flags. Identify his motives and any manipulation tactics.\n\n--- CONVERSATION ---\n' + conversationText
      });
    }

    // Call GPT-4o
    const aiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + OPENAI_KEY
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: messages,
        max_tokens: 2000,
        temperature: 0.3,
        response_format: { type: 'json_object' }
      })
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json().catch(() => ({}));
      console.error('[RedFlag] OpenAI error:', errData);
      return res.status(500).json({ error: 'AI analysis failed' });
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';

    // Parse JSON from response — handle markdown fences, extra text, etc.
    let scan;
    try {
      // Try direct parse first
      scan = JSON.parse(rawContent);
    } catch (e) {
      try {
        // Strip markdown code fences
        let cleaned = rawContent.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
        // Extract JSON object if there's text before/after it
        const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          scan = JSON.parse(jsonMatch[0]);
        } else {
          throw new Error('No JSON object found');
        }
      } catch (e2) {
        console.error('[RedFlag] Failed to parse AI response:', rawContent.substring(0, 500));
        // Return a fallback scan instead of erroring
        scan = {
          overall_rating: 'caution',
          risk_score: 50,
          summary: 'AI analysis completed but response format was unexpected. The conversation may warrant caution.',
          motive_assessment: 'Unable to determine — please try scanning again.',
          red_flags: [],
          yellow_flags: [{ flag: 'Analysis incomplete', detail: 'The AI returned an unexpected response. Try again or rephrase the conversation.' }],
          green_flags: [],
          safety_tips: ['Trust your instincts — if something feels off, it probably is.', 'Never share personal information (address, workplace) with someone you haven\'t met.'],
          manipulation_tactics: []
        };
      }
    }

    // Store scan in DB (non-blocking, non-fatal)
    try {
      await run(`CREATE TABLE IF NOT EXISTS redflag_scans (
        id SERIAL PRIMARY KEY,
        user_id TEXT,
        overall_rating VARCHAR(20),
        risk_score INTEGER,
        summary TEXT,
        motive_assessment TEXT,
        red_flag_count INTEGER DEFAULT 0,
        yellow_flag_count INTEGER DEFAULT 0,
        green_flag_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`);
    } catch (e) { /* table may already exist with different schema */ }

    try {
      await run(
        `INSERT INTO redflag_scans (user_id, overall_rating, risk_score, summary, motive_assessment, red_flag_count, yellow_flag_count, green_flag_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          String(user.id),
          scan.overall_rating || 'unknown',
          scan.risk_score || 0,
          (scan.summary || '').substring(0, 1000),
          (scan.motive_assessment || '').substring(0, 1000),
          (scan.red_flags || []).length,
          (scan.yellow_flags || []).length,
          (scan.green_flags || []).length
        ]
      );
    } catch (dbErr) {
      // Non-fatal — scan still returns to user even if DB logging fails
      console.error('[RedFlag] DB log error (non-fatal):', dbErr.message);
    }

    return res.status(200).json({ scan });

  } catch (err) {
    console.error('[RedFlag] Scan failed:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
};
