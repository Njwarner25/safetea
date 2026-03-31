const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  // GET — list all moderators
  if (req.method === 'GET') {
    try {
      const mods = await getMany(
        `SELECT id, email, phone, display_name, role, city, created_at,
                avatar_color, avatar_initial, banned, subscription_tier
         FROM users
         WHERE role IN ('moderator', 'admin')
         ORDER BY role DESC, created_at ASC`
      );
      return res.json({ moderators: mods || [] });
    } catch (err) {
      console.error('List moderators error:', err);
      return res.status(500).json({ error: 'Failed to list moderators' });
    }
  }

  // POST — create a new moderator account
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { email, displayName, password, city } = body;

      if (!email || !email.includes('@')) {
        return res.status(400).json({ error: 'Valid email is required' });
      }
      if (!displayName || displayName.trim().length < 2) {
        return res.status(400).json({ error: 'Display name is required (min 2 characters)' });
      }
      if (!password || password.length < 6) {
        return res.status(400).json({ error: 'Password must be at least 6 characters' });
      }

      // Check if email already exists
      const existing = await getOne('SELECT id, role FROM users WHERE email = $1', [email.toLowerCase().trim()]);
      if (existing) {
        // If user exists, promote to moderator
        await run('UPDATE users SET role = $1 WHERE id = $2', ['moderator', existing.id]);
        return res.json({
          message: `Existing user "${email}" promoted to moderator`,
          moderator: { id: existing.id, email: email.toLowerCase().trim(), role: 'moderator' }
        });
      }

      // Create new moderator account
      const passwordHash = await bcrypt.hash(password, 12);
      const initial = displayName.trim()[0].toUpperCase();

      const newMod = await getOne(
        `INSERT INTO users (email, password_hash, display_name, role, city, avatar_type, avatar_initial, avatar_color, subscription_tier)
         Values ($1, $2, $3, 'moderator', $4, 'initial', $5, '#E8A0B5', 'pro')
         RETURNING id, email, display_name, role, city, created_at`,
        [email.toLowerCase().trim(), passwordHash, displayName.trim(), city || null, initial]
      );

      return res.status(201).json({
        message: `Moderator account created for "${displayName.trim()}"`,
        moderator: newMod,
        credentials: { email: email.toLowerCase().trim(), password: password }
      });
    } catch (err) {
      console.error('Create moderator error:', err);
      return res.status(500).json({ error: 'Failed to create moderator' });
    }
  }

  // DELETE — remove moderator role (demote to member)
  if (req.method === 'DELETE') {
    try {
      const body = await parseBody(req);
      const { userId } = body;

      if (!userId) return res.status(400).json({ error: 'userId is required' });

      // Can't demote yourself or other admins
      if (parseInt(userId) === user.id) {
        return res.status(400).json({ error: 'Cannot demote yourself' });
      }
      const target = await getOne('SELECT id, role, display_name FROM users WHERE id = $1', [userId]);
      if (!target) return res.status(404).json({ error: 'User not found' });
      if (target.role === 'admin') return res.status(400).json({ error: 'Cannot demote another admin' });

      await run('UPDATE users SET role = $1 WHERE id = $2', ['member', userId]);

      return res.json({ message: `${target.display_name} demoted to member` });
    } catch (err) {
      console.error('Remove moderator error:', err);
      return res.status(500).json({ error: 'Failed to remove moderator' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
