const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    const { post_id, reason, details } = req.body || {};

    if (!post_id) return res.status(400).json({ error: 'Post ID is required' });
    if (!reason) return res.status(400).json({ error: 'Report reason is required' });

    // Verify post exists
    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [post_id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Can't report your own post
    if (post.user_id === user.id) {
      return res.status(400).json({ error: 'You cannot report your own post' });
    }

    // Check for duplicate report
    const existing = await getOne(
      'SELECT id FROM post_reports WHERE reporter_id = $1 AND post_id = $2',
      [user.id, post_id]
    );
    if (existing) {
      return res.status(409).json({ error: 'You have already reported this post' });
    }

    // Valid reasons
    const validReasons = ['inappropriate', 'harassment', 'spam', 'fake_identity', 'explicit_content', 'threats', 'doxxing', 'false_info', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Invalid report reason. Valid: ' + validReasons.join(', ') });
    }

    // Insert report
    await run(
      'INSERT INTO post_reports (reporter_id, post_id, reported_user_id, reason, details) VALUES ($1, $2, $3, $4, $5)',
      [user.id, post_id, post.user_id, reason, details || null]
    );

    // Count total reports for this post
    const reportCount = await getOne(
      'SELECT COUNT(*) as count FROM post_reports WHERE post_id = $1',
      [post_id]
    );

    // Auto-hide post at 3+ unique reports
    if (parseInt(reportCount.count) >= 3) {
      await run('UPDATE posts SET hidden = true WHERE id = $1', [post_id]);
      console.log(`[REPORT] Post ${post_id} auto-hidden: ${reportCount.count} reports`);
    }

    // Auto-flag user at 5+ total reports across their posts
    const userReportCount = await getOne(
      'SELECT COUNT(*) as count FROM post_reports WHERE reported_user_id = $1',
      [post.user_id]
    );
    if (parseInt(userReportCount.count) >= 5) {
      await run('UPDATE users SET flagged = true WHERE id = $1', [post.user_id]);
      console.log(`[REPORT] User ${post.user_id} auto-flagged: ${userReportCount.count} reports across posts`);
    }

    return res.status(200).json({
      status: 'reported',
      message: 'Report submitted. Our team will review it.',
      report_count: parseInt(reportCount.count)
    });
  } catch (error) {
    console.error('Post report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
