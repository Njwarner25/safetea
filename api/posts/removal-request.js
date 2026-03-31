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
    if (!reason) return res.status(400).json({ error: 'Reason for removal request is required' });

    // Verify post exists
    const post = await getOne('SELECT id, user_id, image_url FROM posts WHERE id = $1', [post_id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Valid reasons for removal request
    const validReasons = ['my_photo_used', 'personal_info_shared', 'defamation', 'privacy_violation', 'copyright', 'other'];
    if (!validReasons.includes(reason)) {
      return res.status(400).json({ error: 'Invalid reason. Valid: ' + validReasons.join(', ') });
    }

    // Check for duplicate request
    const existing = await getOne(
      'SELECT id FROM removal_requests WHERE requester_id = $1 AND post_id = $2',
      [user.id, post_id]
    );
    if (existing) {
      return res.status(409).json({ error: 'You have already submitted a removal request for this post' });
    }

    // Insert removal request
    await run(
      'INSERT INTO removal_requests (requester_id, post_id, post_author_id, reason, details, status) VALUES ($1, $2, $3, $4, $5, $6)',
      [user.id, post_id, post.user_id, reason, details || null, 'pending']
    );

    // If reason is 'my_photo_used' and post has an image, auto-escalate priority
    const priority = reason === 'my_photo_used' && post.image_url ? 'high' : 'normal';

    console.log(`[REMOVAL] Request for post ${post_id} from user ${user.id} — reason: ${reason}, priority: ${priority}`);

    return res.status(200).json({
      status: 'submitted',
      message: 'Removal request submitted. Our team will review within 24-48 hours.',
      priority
    });
  } catch (error) {
    console.error('Removal request error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
