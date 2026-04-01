const { authenticate, cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (user.subscription_tier !== 'pro' && user.subscription_tier !== 'premium') {
    return res.status(403).json({ error: 'Fake call feature requires SafeTea Pro' });
  }

  const body = await parseBody(req);
  const { callerName, context } = body;

  if (!callerName) {
    return res.status(400).json({ error: 'callerName is required' });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'AI service not configured' });
  }

  try {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const contextLine = context ? `Context: ${context}` : 'No specific context provided.';

    const message = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 300,
      system: `You are generating a realistic phone call script for a safety app. The script should sound like a natural phone call from someone the user knows, giving them a believable reason to leave their current situation. The script is spoken by the CALLER only (the user just listens). Keep it to about 30 seconds of speech. Do not include stage directions or quotation marks. Just output the caller's words directly.`,
      messages: [
        {
          role: 'user',
          content: `Generate a fake phone call script from "${callerName}". ${contextLine}. The call should give the user a natural, urgent reason to leave immediately. Output only the caller's spoken words.`,
        },
      ],
    });

    const script = message.content[0]?.text || '';

    return res.status(200).json({ success: true, script });
  } catch (err) {
    console.error('Script generation error:', err);
    return res.status(500).json({ error: 'Failed to generate script', details: err.message });
  }
};
