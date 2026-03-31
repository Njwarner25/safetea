const { authenticate, cors } = require('../../_utils/auth');
const { run } = require('../../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const result = await run(
      `UPDATE posts SET is_flagged = true
       WHERE ai_credibility_score <= 3 AND ai_credibility_score IS NOT NULL AND is_flagged = false
       RETURNING id`
    );
    const count = result.rows ? result.rows.length : 0;
    return res.json({ message: `${count} posts flagged for review`, count });
  } catch (err) {
    console.error('Bulk flag error:', err);
    return res.status(500).json({ error: 'Failed to bulk flag' });
  }
};
