const { cors, authenticate, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { getTrustLevel, gateResponse } = require('../_utils/trust-level');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const url = new URL(req.url, `http://${req.headers.host}`);
    const postId = url.searchParams.get('postId');
    if (!postId) return res.status(400).json({ error: 'Post ID is required' });

    const body = await parseBody(req);
    // reaction: 'like' or 'dislike'. Default 'like' for backwards compat
    var reaction = (body.reaction === 'dislike') ? 'dislike' : 'like';

    const post = await getOne('SELECT room_id FROM room_posts WHERE id = $1', [postId]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    // Trust Level gate — Level 1+ to react
    const trust = await getTrustLevel(user);
    if (!trust.permissions.canReact) {
      return res.status(403).json(gateResponse('canReact', trust));
    }
    const membership = await getOne(
      `SELECT id FROM room_memberships WHERE room_id = $1 AND user_id = $2 AND status = 'approved'`,
      [post.room_id, user.id]
    );
    if (!membership) return res.status(403).json({ error: 'You need an invite code to join this room.' });

    // Check existing reaction
    const existing = await getOne(
      'SELECT id, reaction FROM room_post_likes WHERE post_id = $1 AND user_id = $2',
      [postId, user.id]
    );

    if (existing) {
      if (existing.reaction === reaction) {
        // Same reaction — toggle off (remove)
        await run('DELETE FROM room_post_likes WHERE id = $1', [existing.id]);
        return res.status(200).json({ reaction: null, removed: true });
      } else {
        // Different reaction — switch it
        await run('UPDATE room_post_likes SET reaction = $1 WHERE id = $2', [reaction, existing.id]);
        return res.status(200).json({ reaction: reaction, switched: true });
      }
    } else {
      // New reaction
      await run(
        'INSERT INTO room_post_likes (post_id, user_id, reaction) VALUES ($1, $2, $3)',
        [postId, user.id, reaction]
      );
      return res.status(200).json({ reaction: reaction });
    }
  } catch (err) {
    console.error('Room like error:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
