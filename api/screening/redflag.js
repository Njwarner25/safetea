const { authenticate, cors, parseBody } = require('../_utils/auth');
const { run, getOne } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

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
        temperature: 0.3
      })
    });

    if (!aiRes.ok) {
      const errData = await aiRes.json().catch(() => ({}));
      console.error('[RedFlag] OpenAI error:', errData);
      return res.status(500).json({ error: 'AI analysis failed' });
    }

    const aiData = await aiRes.json();
    const rawContent = aiData.choices?.[0]?.message?.content || '';

    // Parse JSON from response (strip markdown fences if present)
    let scan;
    try {
      const jsonStr = rawContent.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
      scan = JSON.parse(jsonStr);
    } catch (e) {
      console.error('[RedFlag] Failed to parse AI response:', rawContent.substring(0, 200));
      return res.status(500).json({ error: 'Failed to parse AI analysis' });
    }

    // Store scan in DB (create table if needed)
    try {
      await run(`CREATE TABLE IF NOT EXISTS redflag_scans (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id),
        overall_rating VARCHAR(20),
        risk_score INTEGER,
        summary TEXT,
        motive_assessment TEXT,
        red_flag_count INTEGER DEFAULT 0,
        yellow_flag_count INTEGER DEFAULT 0,
        green_flag_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`);

      await run(
        `INSERT INTO redflag_scans (user_id, overall_rating, risk_score, summary, motive_assessment, red_flag_count, yellow_flag_count, green_flag_count)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          user.id,
          scan.overall_rating || 'unknown',
          scan.risk_score || 0,
          scan.summary || '',
          scan.motive_assessment || '',
          (scan.red_flags || []).length,
          (scan.yellow_flags || []).length,
          (scan.green_flags || []).length
        ]
      );
    } catch (dbErr) {
      console.error('[RedFlag] DB error (non-fatal):', dbErr.message);
    }

    return res.status(200).json({ scan });

  } catch (err) {
    console.error('[RedFlag] Scan failed:', err);
    return res.status(500).json({ error: 'Scan failed', details: err.message });
  }
};
