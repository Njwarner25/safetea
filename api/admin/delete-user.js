const { authenticate, cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'DELETE') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admin-only guard
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  try {
    const { email, user_id } = req.query || {};
    if (!email && !user_id) {
      return res.status(400).json({ error: 'Provide email or user_id query param' });
    }

    // Find the target user
    let target;
    if (email) {
      target = await getOne('SELECT id, email, display_name, role FROM users WHERE LOWER(email) = LOWER($1)', [email]);
    } else {
      target = await getOne('SELECT id, email, display_name, role FROM users WHERE id = $1', [user_id]);
    }

    if (!target) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Prevent deleting yourself or other admins
    if (target.id === user.id) {
      return res.status(400).json({ error: 'Cannot delete your own account' });
    }
    if (target.role === 'admin') {
      return res.status(400).json({ error: 'Cannot delete admin accounts' });
    }

    const targetId = target.id;

    // Delete from tables without ON DELETE CASCADE
    await run('DELETE FROM replies WHERE user_id = $1', [targetId]);
    await run('DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [targetId]);
    await run('DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [targetId]);
    await run('DELETE FROM posts WHERE user_id = $1', [targetId]);
    await run('DELETE FROM alerts WHERE user_id = $1', [targetId]);
    await run('DELETE FROM user_city_votes WHERE user_id = $1', [targetId]);

    // Delete the user — cascades to watched_names, name_watch_alerts,
    // gender_reports, messages, post_reports, removal_requests, ban_log,
    // verification_attempts, date_checkouts, date_trusted_contacts
    await run('DELETE FROM users WHERE id = $1', [targetId]);

    console.log(`[ADMIN] User ${targetId} (${target.email}) deleted by admin ${user.id}`);

    return res.status(200).json({
      success: true,
      deleted: {
        id: targetId,
        email: target.email,
        display_name: target.display_name
      }
    });
  } catch (error) {
    console.error('Delete user error:', error);
    return res.status(500).json({ error: 'Failed to delete user' });
  }
};
