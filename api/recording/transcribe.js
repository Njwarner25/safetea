const { cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

// Transcribe audio chunks using OpenAI Whisper API
// Called after recording stops or by the tracking page on-demand

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;

async function transcribeAudio(sessionKey) {
  if (!OPENAI_API_KEY) {
    return { success: false, error: 'OPENAI_API_KEY not configured' };
  }

  // Check if already transcribed
  const session = await getOne(
    'SELECT transcript FROM recording_sessions WHERE session_key = $1',
    [sessionKey]
  );
  if (session && session.transcript) {
    return { success: true, transcript: session.transcript, cached: true };
  }

  // Get all audio chunks
  const chunks = await getMany(
    'SELECT audio_data, chunk_number, duration_ms FROM recording_chunks WHERE session_key = $1 ORDER BY chunk_number ASC',
    [sessionKey]
  );

  if (!chunks || chunks.length === 0) {
    return { success: false, error: 'No audio chunks found' };
  }

  // Transcribe each chunk and combine (Whisper has a 25MB limit, chunks are ~10s each so should be fine individually)
  const transcripts = [];

  for (const chunk of chunks) {
    try {
      // Convert base64 to binary buffer
      const audioBuffer = Buffer.from(chunk.audio_data, 'base64');

      // Build multipart form data manually for Whisper API
      const boundary = '----FormBoundary' + Math.random().toString(36).slice(2);
      const formParts = [];

      // File part
      formParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="file"; filename="chunk-${chunk.chunk_number}.webm"\r\n` +
        `Content-Type: audio/webm\r\n\r\n`
      );
      formParts.push(audioBuffer);
      formParts.push('\r\n');

      // Model part
      formParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="model"\r\n\r\n` +
        `whisper-1\r\n`
      );

      // Language hint
      formParts.push(
        `--${boundary}\r\n` +
        `Content-Disposition: form-data; name="language"\r\n\r\n` +
        `en\r\n`
      );

      formParts.push(`--${boundary}--\r\n`);

      // Combine parts into single buffer
      const bodyParts = formParts.map(p => typeof p === 'string' ? Buffer.from(p) : p);
      const bodyBuffer = Buffer.concat(bodyParts);

      const resp = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENAI_API_KEY}`,
          'Content-Type': `multipart/form-data; boundary=${boundary}`,
        },
        body: bodyBuffer,
      });

      if (resp.ok) {
        const data = await resp.json();
        if (data.text && data.text.trim()) {
          transcripts.push({
            chunk: chunk.chunk_number,
            text: data.text.trim()
          });
        }
      } else {
        console.error(`Whisper API error for chunk ${chunk.chunk_number}:`, resp.status, await resp.text());
      }
    } catch (err) {
      console.error(`Transcription error for chunk ${chunk.chunk_number}:`, err.message);
    }

    // Small delay between API calls
    await new Promise(r => setTimeout(r, 300));
  }

  // Combine transcripts
  const fullTranscript = transcripts.map(t => t.text).join(' ');

  if (fullTranscript) {
    // Store transcript
    await run(
      'UPDATE recording_sessions SET transcript = $1 WHERE session_key = $2',
      [fullTranscript, sessionKey]
    );
  }

  return {
    success: true,
    transcript: fullTranscript || '(No speech detected)',
    chunks: transcripts,
    cached: false
  };
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const url = new URL(req.url, `http://${req.headers.host}`);
  const sessionKey = url.searchParams.get('key') || req.query?.key;

  if (!sessionKey) {
    return res.status(400).json({ error: 'Session key required' });
  }

  try {
    const result = await transcribeAudio(sessionKey);
    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }
    return res.status(200).json(result);
  } catch (err) {
    console.error('Transcribe endpoint error:', err);
    return res.status(500).json({ error: 'Transcription failed' });
  }
};

// Export for use by other endpoints
module.exports.transcribeAudio = transcribeAudio;
