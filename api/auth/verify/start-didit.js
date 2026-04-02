const { authenticate, cors } = require('../../_utils/auth');
const { run } = require('../../_utils/db');

const DIDIT_API_KEY = process.env.DIDIT_API_KEY;
const DIDIT_WORKFLOW_ID = process.env.DIDIT_WORKFLOW_ID;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (!DIDIT_API_KEY || !DIDIT_WORKFLOW_ID) {
    return res.status(500).json({ error: 'Didit verification not configured' });
  }

  try {
    const response = await fetch('https://verification.didit.me/v3/session/', {
      method: 'POST',
      headers: {
        'x-api-key': DIDIT_API_KEY,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        workflow_id: DIDIT_WORKFLOW_ID,
        callback: 'https://getsafetea.app/verify.html?didit=complete',
        vendor_data: String(user.id)
      })
    });

    if (!response.ok) {
      const err = await response.text();
      console.error('[Didit] Session creation failed:', response.status, err);
      return res.status(502).json({ error: 'Failed to create verification session' });
    }

    const data = await response.json();

    // Store session_id on user row
    await run('UPDATE users SET didit_session_id = $1 WHERE id = $2', [data.session_id, user.id]);

    return res.status(200).json({
      verification_url: data.url,
      session_id: data.session_id
    });
  } catch (err) {
    console.error('[Didit] Error:', err);
    return res.status(500).json({ error: 'Verification service error' });
  }
};
