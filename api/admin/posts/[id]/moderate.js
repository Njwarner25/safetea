const { authenticate, cors, parseBody } = require('../../../_utils/auth');
const { getOne, run } = require('../../../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (req.method !== 'PATCH') return res.status(405).json({ error: 'Method not allowed' });

  const { id } = req.query;
  const body = await parseBody(req);
  const { action } = body;

  if (!['approve', 'flag', 'remove'].includes(action)) {
    return res.status(400).json({ error: 'Invalid action. Must be: approve, flag, or remove' });
  }

  try {
    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    if (action === 'remove') {
      await run('UPDATE posts SET hidden = true WHERE id = $1', [id]);
      return res.json({ message: 'Post removed' });
    }

    const flagged = action === 'flag';
    await run('UPDATE posts SET is_flagged = $1 WHERE id = $2', [flagged, id]);
    return res.json({ message: `Post ${action === 'approve' ? 'approved' : 'flagged'}` });
  } catch (err) {
    console.error('Moderate post error:', err);
    return res.status(500).json({ error: 'Failed to moderate post' });
  }
};
