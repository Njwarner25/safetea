const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');
const { enforceCityChatAccess } = require('../_utils/gender-gate');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Gender gate: city chat is a women-only space
  if (await enforceCityChatAccess(user, res)) return;

  const city = req.query.city || null;
  const category = req.query.category || null;
  const limit = Math.min(parseInt(req.query.limit) || 20, 50);

  try {
    let where = "p.feed = 'community'";
    const params = [];
    let paramIdx = 0;

    if (city) {
      paramIdx++;
      where += ` AND p.city ILIKE $${paramIdx}`;
      params.push('%' + city + '%');
    }
    if (category) {
      paramIdx++;
      where += ` AND p.category = $${paramIdx}`;
      params.push(category);
    }

    paramIdx++;
    const limitParam = `$${paramIdx}`;
    params.push(limit);

    // user_liked / user_disliked / user_bumped subqueries
    paramIdx++;
    params.push(user.id);
    const userIdParam = paramIdx;
    const userLikedSelect = `EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $${userIdParam}) AS user_liked`;
    const userDislikedSelect = `EXISTS(SELECT 1 FROM post_dislikes pd2 WHERE pd2.post_id = p.id AND pd2.user_id = $${userIdParam}) AS user_disliked`;
    const userBumpedSelect = `EXISTS(SELECT 1 FROM post_bumps pb2 WHERE pb2.post_id = p.id AND pb2.user_id = $${userIdParam}) AS user_bumped`;

    let posts;
    try {
      posts = await getMany(
        `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                p.feed, p.image_url, p.created_at, p.hidden,
                COALESCE(p.bump_count, 0) AS bump_count,
                COALESCE(p.dislike_count, 0) AS dislike_count,
                p.last_bumped_at,
                u.display_name AS author_name,
                u.custom_display_name AS author_custom_name,
                u.avatar_color, u.avatar_initial,
                COALESCE(u.subscription_tier, 'free') AS author_tier,
                (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
                (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                ${userLikedSelect},
                ${userDislikedSelect},
                ${userBumpedSelect}
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE ${where}
         ORDER BY
           COALESCE(p.bump_count, 0) * 2
           + (SELECT COUNT(*) FROM post_likes pl3 WHERE pl3.post_id = p.id)
           + (SELECT COUNT(*) FROM replies r2 WHERE r2.post_id = p.id)
           - COALESCE(p.dislike_count, 0) DESC,
           COALESCE(p.last_bumped_at, p.created_at) DESC
         LIMIT ${limitParam}`,
        params
      );
    } catch (queryErr) {
      // Fallback if new tables/columns don't exist yet
      console.warn('[Community] Full query failed, using fallback:', queryErr.message);
      const fbParams = [];
      let fbWhere = "p.feed = 'community'";
      let fbIdx = 0;
      if (city) { fbIdx++; fbWhere += ` AND p.city ILIKE $${fbIdx}`; fbParams.push('%' + city + '%'); }
      if (category) { fbIdx++; fbWhere += ` AND p.category = $${fbIdx}`; fbParams.push(category); }
      fbIdx++; fbParams.push(limit);
      fbIdx++; fbParams.push(user.id);
      posts = await getMany(
        `SELECT p.id, p.user_id, p.title, p.body, p.category, p.city,
                p.feed, p.image_url, p.created_at, p.hidden,
                0 AS bump_count, 0 AS dislike_count, NULL AS last_bumped_at,
                u.display_name AS author_name,
                u.custom_display_name AS author_custom_name,
                u.avatar_color, u.avatar_initial,
                COALESCE(u.subscription_tier, 'free') AS author_tier,
                (SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) AS reply_count,
                (SELECT COUNT(*) FROM post_likes pl WHERE pl.post_id = p.id) AS like_count,
                EXISTS(SELECT 1 FROM post_likes pl2 WHERE pl2.post_id = p.id AND pl2.user_id = $${fbIdx}) AS user_liked,
                false AS user_disliked,
                false AS user_bumped
         FROM posts p
         LEFT JOIN users u ON u.id = p.user_id
         WHERE ${fbWhere}
         ORDER BY p.created_at DESC
         LIMIT $${fbIdx - 1}`,
        fbParams
      );
    }

    return res.status(200).json(posts);
  } catch (err) {
    return res.status(500).json({ error: 'Failed to load community posts', details: err.message });
  }
};
