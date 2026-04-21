const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { sendNameWatchMatchEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // ========== GET: List posts ==========
  if (req.method === 'GET') {
    const feed = req.query.feed || 'safety';
    const category = req.query.category || null;
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);

    // Optional auth for user_liked
    let userId = null;
    try {
      const user = await authenticate(req);
      if (user) userId = user.id;
    } catch (e) { /* not logged in */ }

    try {
      const params = [feed, limit];
      let categoryFilter = '';
      if (category) {
        params.push(category);
        categoryFilter = ` AND p.category = $${params.length}`;
      }
      let userLikedSelect = 'false AS user_liked';
      let userDislikedSelect = 'false AS user_disliked';
      let userBumpedSelect = 'false AS user_bumped';
      if (userId) {
        params.push(userId);
        const uidParam = params.length;
        userLikedSelect = `EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $${uidParam}) AS user_liked`;
        userDislikedSelect = `EXISTS(SELECT 1 FROM post_dislikes pd2 WHERE pd2.post_id = p.id AND pd2.user_id = $${uidParam}) AS user_disliked`;
        userBumpedSelect = `EXISTS(SELECT 1 FROM post_bumps pb2 WHERE pb2.post_id = p.id AND pb2.user_id = $${uidParam}) AS user_bumped`;
      }

      let posts;
      try {
        posts = await getMany(
          `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                  p.likes, p.feed, p.image_url, p.created_at, p.hidden,
                  COALESCE(p.bump_count, 0) AS bump_count,
                  COALESCE(p.dislike_count, 0) AS dislike_count,
                  p.last_bumped_at,
                  u.display_name AS author_name,
                  u.custom_display_name AS author_custom_name,
                  u.avatar_color,
                  COALESCE(u.subscription_tier, 'free') AS author_tier,
                  COALESCE(u.trust_score, 0) AS author_trust_score,
                  COALESCE(u.is_verified, false) AS author_is_verified,
                  COALESCE(u.identity_verified, false) AS author_identity_verified,
                  (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
                  (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                  ${userLikedSelect},
                  ${userDislikedSelect},
                  ${userBumpedSelect}
           FROM posts p
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.feed = $1 AND (p.hidden IS NOT TRUE)${categoryFilter}
           ORDER BY
             COALESCE(p.bump_count, 0) * 2
             + (SELECT COUNT(*) FROM post_likes pl3 WHERE pl3.post_id = p.id)
             + (SELECT COUNT(*) FROM replies r2 WHERE r2.post_id = p.id)
             - COALESCE(p.dislike_count, 0) DESC,
             COALESCE(p.last_bumped_at, p.created_at) DESC
           LIMIT $2`,
          params
        );
      } catch (queryErr) {
        // Fallback: tables/columns may not exist yet (migration not run)
        console.warn('[Posts] Full query failed, using fallback:', queryErr.message);
        const fbParams = [feed, limit];
        let fbCatFilter = '';
        if (category) {
          fbParams.push(category);
          fbCatFilter = ` AND p.category = $${fbParams.length}`;
        }
        let fbUserLiked = 'false AS user_liked';
        if (userId) {
          fbParams.push(userId);
          fbUserLiked = `EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $${fbParams.length}) AS user_liked`;
        }
        posts = await getMany(
          `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                  p.likes, p.feed, p.image_url, p.created_at, p.hidden,
                  0 AS bump_count, 0 AS dislike_count,
                  NULL AS last_bumped_at,
                  u.display_name AS author_name,
                  u.custom_display_name AS author_custom_name,
                  u.avatar_color,
                  COALESCE(u.subscription_tier, 'free') AS author_tier,
                  COALESCE(u.trust_score, 0) AS author_trust_score,
                  COALESCE(u.is_verified, false) AS author_is_verified,
                  COALESCE(u.identity_verified, false) AS author_identity_verified,
                  (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
                  (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                  ${fbUserLiked},
                  false AS user_disliked,
                  false AS user_bumped
           FROM posts p
           LEFT JOIN users u ON u.id = p.user_id
           WHERE p.feed = $1 AND (p.hidden IS NOT TRUE)${fbCatFilter}
           ORDER BY p.created_at DESC
           LIMIT $2`,
          fbParams
        );
      }

      return res.status(200).json(posts);
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load posts', details: err.message });
    }
  }

  // ========== POST: Create a post ==========
  if (req.method === 'POST') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = req.body || {};
    const { title, body: postBody, category, city, feed, image_url } = body;

    if (!title || !postBody) {
      return res.status(400).json({ error: 'Title and body are required' });
    }

    try {
      const result = await getOne(
        `INSERT INTO posts (user_id, title, body, category, city, feed, image_url, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, NOW())
         RETURNING id`,
        [user.id, title, postBody, category || 'general', city || null, feed || 'safety', image_url || null]
      );

      // Check Name Watch matches (non-blocking)
      checkNameWatchMatches(result.id, postBody, city).catch(function(err) {
        console.error('[NameWatch] Match check failed:', err.message);
      });

      return res.status(201).json({ id: result.id, message: 'Post created' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to create post', details: err.message });
    }
  }

  // ========== PUT: Edit a post (requires ?id=) ==========
  if (req.method === 'PUT') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Post ID required (?id=)' });

    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwner = post.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    const body = req.body || {};
    const { title, body: postBody, category, city } = body;

    try {
      await run(
        `UPDATE posts SET
          title = COALESCE($1, title),
          body = COALESCE($2, body),
          category = COALESCE($3, category),
          city = COALESCE($4, city),
          edited_at = NOW()
         WHERE id = $5`,
        [title || null, postBody || null, category || null, city || null, id]
      );

      return res.status(200).json({ message: 'Post updated' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to update post', details: err.message });
    }
  }

  // ========== DELETE: Delete a post (requires ?id=) ==========
  if (req.method === 'DELETE') {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const id = req.query.id;
    if (!id) return res.status(400).json({ error: 'Post ID required (?id=)' });

    const post = await getOne('SELECT id, user_id FROM posts WHERE id = $1', [id]);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    const isOwner = post.user_id === user.id;
    const isAdmin = user.role === 'admin' || user.role === 'moderator';
    if (!isOwner && !isAdmin) {
      return res.status(403).json({ error: 'Not authorized to delete this post' });
    }

    try {
      await run('DELETE FROM replies WHERE post_id = $1', [id]);
      await run('DELETE FROM post_likes WHERE post_id = $1', [id]);
      try { await run('DELETE FROM post_dislikes WHERE post_id = $1', [id]); } catch(e) { /* table may not exist */ }
      try { await run('DELETE FROM post_bumps WHERE post_id = $1', [id]); } catch(e) { /* table may not exist */ }
      await run('DELETE FROM posts WHERE id = $1', [id]);
      return res.status(200).json({ message: 'Post deleted' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to delete post', details: err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};

// ─── Name Watch Match Detection ───
async function checkNameWatchMatches(postId, postBody, postCity) {
  try {
    // Get all watched names (across all users)
    const watchedNames = await getMany(
      `SELECT wn.id, wn.name, wn.user_id, u.email, u.display_name, u.city
       FROM watched_names wn
       JOIN users u ON u.id = wn.user_id
       WHERE u.subscription_tier != 'free'`
    );

    if (!watchedNames || watchedNames.length === 0) return;

    const bodyLower = (postBody || '').toLowerCase();

    for (const wn of watchedNames) {
      const nameLower = wn.name.toLowerCase();
      const nameParts = nameLower.split(/\s+/);

      // Match: full name, first name (2+ chars), or initials
      const fullMatch = bodyLower.includes(nameLower);
      const partMatch = nameParts.some(function(p) { return p.length >= 2 && bodyLower.includes(p); });
      const initials = nameParts.map(function(p) { return p[0]; }).join('').toLowerCase();
      const initialMatch = initials.length >= 2 && bodyLower.includes(initials);

      if (fullMatch || partMatch || initialMatch) {
        // Check if this match already exists
        const existing = await getOne(
          'SELECT id FROM name_watch_matches WHERE watched_name_id = $1 AND post_id = $2',
          [wn.id, postId]
        );
        if (existing) continue;

        // Create match record
        await run(
          'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
          [wn.id, postId, wn.name]
        );

        // Send email notification
        if (wn.email) {
          const snippet = postBody.length > 150 ? postBody.substring(0, 150) + '...' : postBody;
          sendNameWatchMatchEmail(wn.email, wn.display_name, wn.name, snippet, postCity || wn.city).catch(function(err) {
            console.error('[NameWatch] Email failed for', wn.email, err.message);
          });
        }
      }
    }
  } catch (err) {
    console.error('[NameWatch] Match check error:', err.message);
  }
}
