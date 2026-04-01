const { authenticate, cors, parseBody } = require('./_utils/auth');
const { getOne, getMany, run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Check tier — Name Watch requires SafeTea+
  const tier = (user.subscription_tier || 'free').toLowerCase();
  if (tier === 'free') {
    return res.status(403).json({ error: 'Name Watch requires SafeTea+ ($7.99/mo)' });
  }

  // ========== GET: Load watched names + matches ==========
  if (req.method === 'GET') {
    try {
      // Ensure table exists
      await run(`
        CREATE TABLE IF NOT EXISTS watched_names (
          id SERIAL PRIMARY KEY,
          user_id INTEGER NOT NULL,
          name VARCHAR(100) NOT NULL,
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);
      await run(`
        CREATE TABLE IF NOT EXISTS name_watch_matches (
          id SERIAL PRIMARY KEY,
          watched_name_id INTEGER NOT NULL,
          post_id INTEGER NOT NULL,
          matched_name VARCHAR(100),
          created_at TIMESTAMP DEFAULT NOW()
        )
      `);

      const names = await getMany(
        `SELECT wn.id, wn.name, wn.created_at,
                (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id) as match_count
         FROM watched_names wn
         WHERE wn.user_id = $1
         ORDER BY wn.created_at DESC`,
        [user.id]
      );

      const matches = await getMany(
        `SELECT nwm.id, nwm.matched_name, nwm.created_at, wn.name as watched_name
         FROM name_watch_matches nwm
         JOIN watched_names wn ON wn.id = nwm.watched_name_id
         WHERE wn.user_id = $1
         ORDER BY nwm.created_at DESC
         LIMIT 20`,
        [user.id]
      );

      return res.status(200).json({ success: true, names, matches });
    } catch (err) {
      console.error('Name Watch load error:', err);
      return res.status(500).json({ error: 'Failed to load watch list' });
    }
  }

  // ========== POST: Add a watched name ==========
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { name } = body;

      if (!name || name.trim().length < 2) {
        return res.status(400).json({ error: 'Name must be at least 2 characters' });
      }

      // Check for duplicates
      const existing = await getOne(
        'SELECT id FROM watched_names WHERE user_id = $1 AND LOWER(name) = LOWER($2)',
        [user.id, name.trim()]
      );
      if (existing) {
        return res.status(409).json({ error: 'You are already watching this name' });
      }

      // Limit to 20 watched names
      const countResult = await getOne(
        'SELECT COUNT(*) as count FROM watched_names WHERE user_id = $1',
        [user.id]
      );
      if (countResult && parseInt(countResult.count) >= 20) {
        return res.status(400).json({ error: 'Maximum 20 watched names allowed' });
      }

      const result = await getOne(
        'INSERT INTO watched_names (user_id, name) VALUES ($1, $2) RETURNING id, name, created_at',
        [user.id, name.trim()]
      );

      return res.status(201).json({ success: true, name: result });
    } catch (err) {
      console.error('Name Watch add error:', err);
      return res.status(500).json({ error: 'Failed to add watched name' });
    }
  }

  // ========== DELETE: Remove a watched name ==========
  if (req.method === 'DELETE') {
    try {
      const body = await parseBody(req);
      const { id } = body;

      if (!id) return res.status(400).json({ error: 'Name ID is required' });

      // Verify ownership
      const name = await getOne(
        'SELECT id FROM watched_names WHERE id = $1 AND user_id = $2',
        [id, user.id]
      );
      if (!name) return res.status(404).json({ error: 'Watched name not found' });

      // Delete matches first, then the name
      await run('DELETE FROM name_watch_matches WHERE watched_name_id = $1', [id]);
      await run('DELETE FROM watched_names WHERE id = $1', [id]);

      return res.status(200).json({ success: true });
    } catch (err) {
      console.error('Name Watch remove error:', err);
      return res.status(500).json({ error: 'Failed to remove watched name' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
