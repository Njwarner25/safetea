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
      const { roomId, type, text, photoId } = body;

      if (!roomId || !text?.trim()) {
        return res.status(400).json({ error: 'Room ID and text are required' });
      }

      const validTypes = ['tea_talk', 'good_guys'];
      const postType = validTypes.includes(type) ? type : 'tea_talk';

      // Verify membership and not muted
      const membership = await getOne(
        `SELECT * FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
        [roomId, user.id]
      );
      if (!membership) {
        return res.status(403).json({ error: 'You are not a member of this room' });
      }
      if (membership.muted_until && new Date(membership.muted_until) > new Date()) {
        return res.status(403).json({
          error: 'You are muted in this room',
          mutedUntil: membership.muted_until
        });
      }

      // Full name blocking — same rules as main feed
      const nameCheck = await checkForFullNames(text.trim());
      if (nameCheck.fullNameDetected) {
        return res.status(400).json({
          error: 'Your post contains full names. Please use first name + last initial instead.',
          detected: nameCheck.detectedNames,
          suggestion: nameCheck.suggestion
        });
      }

      const post = await getOne(
        `INSERT INTO room_posts (room_id, author_id, type, body, photo_id)
         VALUES ($1, $2, $3, $4, $5)
         RETURNING *`,
        [roomId, user.id, postType, text.trim(), photoId || null]
      );

      return res.status(201).json(post);
    } catch (err) {
      console.error('Room post create error:', err);
      return res.status(500).json({ error: 'Internal server error' });
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
      const membership = await getOne(
        `SELECT role FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
        [post.room_id, user.id]
      );
      const isRoomAdmin = membership && (membership.role === 'admin' || membership.role === 'co_admin');
      const isSafeTeaAdmin = user.role === 'admin' || user.role === 'moderator';

      if (!isAuthor && !isRoomAdmin && !isSafeTeaAdmin) {
        return res.status(403).json({ error: 'Not authorized to delete this post' });
      }

      if (isRoomAdmin && !isAuthor) {
        // Room admin deleting someone else's post — mark as admin-deleted
        await run('UPDATE room_posts SET deleted_by_admin = TRUE WHERE id = $1', [postId]);
      } else {
        // Author deleting own post — hard delete
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
