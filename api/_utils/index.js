const { getOne, getMany, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');
const { generateSearchTerms, scanExistingPosts } = require('../_utils/namewatch');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    // Require premium tier
    if (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro' && user.role !== 'admin' && user.role !== 'moderator') {
      return res.status(403).json({
        error: 'Pro subscription required',
        upgrade: true,
        message: 'Name Watch requires SafeTea+. Upgrade to monitor names and get alerts.'
      });
    }

    // GET — list watched names with match counts
    if (req.method === 'GET') {
      const names = await getMany(
        `SELECT wn.*,
          (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id) as match_count,
          (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id AND nwm.is_read = false) as unread_count
        FROM watched_names wn
        WHERE wn.user_id = $1
        ORDER BY wn.created_at DESC`,
        [user.id]
      );

      // Also get recent matches
      const matches = await getMany(
        `SELECT nwm.*, wn.display_name as matched_name, p.content as post_content, p.city as post_city, p.created_at as post_date
         FROM name_watch_matches nwm
         JOIN watched_names wn ON nwm.watched_name_id = wn.id
         LEFT JOIN posts p ON nwm.post_id = p.id
         WHERE wn.user_id = $1
         ORDER BY nwm.created_at DESC
         LIMIT 20`,
        [user.id]
      );

      return res.json({ names, matches });
    }

    // POST — add a watched name
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const name = (body.name || '').trim();

      if (!name || name.length < 2 || name.length > 100) {
        return res.status(400).json({ error: 'Name must be 2-100 characters' });
      }

      // Check for duplicates
      const existing = await getOne(
        'SELECT id FROM watched_names WHERE user_id = $1 AND LOWER(display_name) = LOWER($2)',
        [user.id, name]
      );
      if (existing) {
        return res.status(409).json({ error: 'You are already watching this name' });
      }

      // Limit to 20
      const countResult = await getOne(
        'SELECT COUNT(*) as count FROM watched_names WHERE user_id = $1',
        [user.id]
      );
      if (parseInt(countResult.count) >= 20) {
        return res.status(400).json({ error: 'Maximum of 20 watched names allowed' });
      }

      const searchTerms = generateSearchTerms(name);

      const result = await run(
        'INSERT INTO watched_names (user_id, display_name, search_terms) VALUES ($1, $2, $3) RETURNING id',
        [user.id, name, searchTerms]
      );

      const newId = result.rows[0].id;

      // Scan existing posts for matches (async, non-blocking)
      scanExistingPosts(newId, searchTerms, user.city).catch(err => {
        console.error('Scan existing posts error (non-blocking):', err);
      });

      return res.status(201).json({ success: true, id: newId, name: name });
    }

    // DELETE — remove a watched name
    if (req.method === 'DELETE') {
      const body = await parseBody(req);
      const id = body.id;
      if (!id) return res.status(400).json({ error: 'Missing name ID' });

      const existing = await getOne(
        'SELECT id FROM watched_names WHERE id = $1 AND user_id = $2',
        [id, user.id]
      );
      if (!existing) return res.status(404).json({ error: 'Watched name not found' });

      await run('DELETE FROM name_watch_matches WHERE watched_name_id = $1', [id]);
      await run('DELETE FROM watched_names WHERE id = $1', [id]);

      return res.json({ success: true });
    }

    res.setHeader('Allow', 'GET, POST, DELETE, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (error) {
    console.error('Namewatch API error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
