const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { checkForFullNames } = require('../_utils/check-fullname');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const url = new URL(req.url, `http://${req.headers.host}`);

  // POST — create a post
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { roomId, type, text, image } = body;

      if (!roomId || !text || !text.trim()) {
        return res.status(400).json({ error: 'Room ID and text are required' });
      }

      const validTypes = ['tea_talk', 'good_guys'];
      const postType = validTypes.includes(type) ? type : 'tea_talk';

      // Trust score gate: require >= 70
      if ((user.trust_score || 0) < 70) {
        return res.status(403).json({
          error: 'trust_score_too_low',
          trust_score: user.trust_score || 0,
          required: 70,
          message: 'Complete verification steps to unlock room posting. Verify your identity and link social media accounts to get access.'
        });
      }

      // Verify membership (rooms are invite-only)
      const membership = await getOne(
        `SELECT * FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
        [roomId, user.id]
      );
      if (!membership) {
        return res.status(403).json({ error: 'You need an invite code to join this room before posting.' });
      }

      // Full name blocking
      const nameCheck = await checkForFullNames(text.trim());
      if (nameCheck.fullNameDetected) {
        return res.status(400).json({
          error: 'Your post contains full names. Please use first name + last initial instead.',
          detected: nameCheck.detectedNames,
          suggestion: nameCheck.suggestion
        });
      }

      // Validate image if provided (max 5MB base64)
      var imageData = null;
      if (image) {
        var stripped = image.replace(/^data:image\/\w+;base64,/, '');
        try {
          var buf = Buffer.from(stripped, 'base64');
          if (buf.length > 5 * 1024 * 1024) {
            return res.status(400).json({ error: 'Image must be under 5MB' });
          }
          imageData = image; // Store with data URL prefix
        } catch (e) {
          return res.status(400).json({ error: 'Invalid image data' });
        }
      }

      const post = await getOne(
        `INSERT INTO room_posts (room_id, author_id, type, body, image_data)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING id, room_id, author_id, type, body, pinned, created_at, bump_count`,
        [roomId, user.id, postType, text.trim(), imageData]
      );

      return res.status(201).json(post);
    } catch (err) {
      console.error('Room post create error:', err);
      return res.status(500).json({ error: 'Failed to create post' });
    }
  }

  // DELETE — delete a post (author or room admin)
  if (req.method === 'DELETE') {
    try {
      const postId = url.searchParams.get('postId');
      if (!postId) return res.status(400).json({ error: 'Post ID is required' });

      const post = await getOne('SELECT * FROM room_posts WHERE id = $1', [postId]);
      if (!post) return res.status(404).json({ error: 'Post not found' });

      const isAuthor = post.author_id === user.id;
      const isSafeTeaAdmin = user.role === 'admin' || user.role === 'moderator';

      if (!isAuthor && !isSafeTeaAdmin) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
      }

      if (isSafeTeaAdmin && !isAuthor) {
        await run('UPDATE room_posts SET deleted_by_admin = TRUE WHERE id = $1', [postId]);
      } else {
        await run('DELETE FROM room_posts WHERE id = $1', [postId]);
      }

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Room post delete error:', err);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
