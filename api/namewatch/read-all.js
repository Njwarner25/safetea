const { authenticate, cors } = require('../_utils/auth');
const { run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST' && req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await run(
      `UPDATE name_watch_matches SET is_read = true
       WHERE watched_name_id IN (SELECT id FROM watched_names WHERE user_id = $1)`,
      [user.id]
    );
    return res.json({ success: true });
  } catch (err) {
    console.error('Read-all error:', err);
    return res.status(500).json({ error: 'Failed to mark as read' });
  }
};
