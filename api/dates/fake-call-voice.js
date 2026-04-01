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
    return res.status(403).json({ error: 'Voice synthesis requires SafeTea Pro' });
  }

  const body = await parseBody(req);
  const { script, voiceId } = body;

  if (!script) {
    return res.status(400).json({ error: 'script is required' });
  }

  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: 'Voice service not configured' });
  }

  try {
    // Voice persona mapping
    const VOICE_PERSONAS = {
      mom:        'roYauZ4bOLAKvVZTPLre', // Lena - Engaging and Relatable Mom
      bestfriend: 'uYXf8XasLslADfZ2MB4u', // Hope - Bubbly, Gossipy and Girly
      sister:     'd3MFdIuCfbAIwiu7jC4a', // Anya - Warm, articulate young woman
      dad:        'gfRt6Z3Z8aTbpLfexQ7N', // Boyd - Versatile, Fatherly and Natural
      roommate:   'pwMBn0SsmN1220Aorv15', // Matt - Natural, Chatty, Friendly
    };

    const persona = body.persona ? body.persona.toLowerCase() : null;
    const voice = VOICE_PERSONAS[persona] || voiceId || VOICE_PERSONAS.mom;

    const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}`, {
      method: 'POST',
      headers: {
        'Accept': 'audio/mpeg',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: script,
        model_id: 'eleven_monolingual_v1',
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error('ElevenLabs error:', errText);
      return res.status(500).json({ error: 'Voice synthesis failed' });
    }

    const arrayBuffer = await response.arrayBuffer();
    const base64Audio = Buffer.from(arrayBuffer).toString('base64');

    return res.status(200).json({ success: true, audio: base64Audio });
  } catch (err) {
    console.error('Voice synthesis error:', err);
    return res.status(500).json({ error: 'Failed to synthesize voice', details: err.message });
  }
};
