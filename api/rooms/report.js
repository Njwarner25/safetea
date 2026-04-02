const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const body = await parseBody(req);
    const { postId, reason, details } = body;

    if (!postId) return res.status(400).json({ error: 'Post ID is required' });

    const validReasons = ['harassment', 'doxxing', 'spam', 'inappropriate', 'misinformation', 'threat', 'other'];
    if (!reason || !validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Valid reason is required: ' + validReasons.join(', ') });
    }

    const post = await getOne('SELECT room_id, author_id FROM room_posts WHERE id = $1', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Can't report your own post
    if (post.author_id === user.id) {
      return res.status(400).json({ error: 'You cannot report your own post' });
    }

    // Trust score gate + membership
    if ((user.trust_score || 0) < 70) {
      return res.status(403).json({ error: 'trust_score_too_low', required: 70 });
    }
    const membership = await getOne(
      `SELECT id FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [post.room_id, user.id]
    );
    if (!membership) return res.status(403).json({ error: 'You need an invite code to join this room.' });

    // Check for duplicate report
    const existing = await getOne(
      'SELECT id FROM room_post_reports WHERE post_id = $1 AND reporter_id = $2',
      [postId, user.id]
    );
    if (existing) {
      return res.status(409).json({ error: 'You have already reported this post' });
    }

    await run(
      `INSERT INTO room_post_reports (post_id, reporter_id, reason, details) VALUES ($1, $2, $3, $4)`,
      [postId, user.id, reason, (details || '').trim().substring(0, 500) || null]
    );

    // Auto-flag post if it gets 3+ reports
    const reportCount = await getOne(
      'SELECT COUNT(*) AS total FROM room_post_reports WHERE post_id = $1',
      [postId]
    );
    if (parseInt(reportCount.total) >= 3) {
      await run('UPDATE room_posts SET is_flagged = TRUE WHERE id = $1', [postId]);
    }

    return res.status(200).json({ success: true, message: 'Report submitted. Thank you for keeping the community safe.' });
  } catch (err) {
    console.error('Room report error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
