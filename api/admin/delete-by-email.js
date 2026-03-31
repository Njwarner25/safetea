const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  // Auth via migrate secret (no DB-based login required)
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'email query param required' });

  try {
    const target = await getOne('SELECT id, email, display_name, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    if (!target) return res.status(404).json({ error: 'User not found' });

    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin accounts' });
    }

    const id = target.id;
    await run('DELETE FROM replies WHERE user_id = $1', [id]);
    await run('DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [id]);
    await run('DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [id]);
    await run('DELETE FROM posts WHERE user_id = $1', [id]);
    await run('DELETE FROM alerts WHERE user_id = $1', [id]);
    await run('DELETE FROM user_city_votes WHERE user_id = $1', [id]);
    await run('DELETE FROM users WHERE id = $1', [id]);

    console.log('[ADMIN] Deleted user:', target.id, target.email);
    return res.status(200).json({ success: true, deleted: { id: target.id, email: target.email, display_name: target.display_name } });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Failed: ' + error.message });
  }
};
