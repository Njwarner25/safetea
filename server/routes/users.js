const express = require('express');
const db = require('../db/database');
const { authenticate, requireRole } = require('../middleware/auth');

const router = express.Router();

// GET /api/users/profile - Get own profile
router.get('/profile', authenticate, (req, res) => {
    const user = db.prepare(`
        SELECT id, email, display_name, role, city, state, is_verified, is_anonymous, avatar_initial, avatar_color, created_at, last_login
            FROM users WHERE id = ?
              `).get(req.user.id);

             const postCount = db.prepare('SELECT COUNT(*) as count FROM posts WHERE user_id = ?').get(req.user.id);
    const replyCount = db.prepare('SELECT COUNT(*) as count FROM replies WHERE user_id = ?').get(req.user.id);

             res.json({
                   user,
                   stats: {
                           posts: postCount.count,
                           replies: replyCount.count
                   }
             });
});

// PUT /api/users/profile - Update profile
router.put('/profile', authenticate, (req, res) => {
    const { display_name, city, state, is_anonymous } = req.body;

             try {
                   db.prepare(`
                         UPDATE users SET display_name = COALESCE(?, display_name), city = COALESCE(?, city), state = COALESCE(?, state), is_anonymous = COALESCE(?, is_anonymous), updated_at = CURRENT_TIMESTAMP
                               WHERE id = ?
                                   `).run(display_name, city, state, is_anonymous !== undefined ? (is_anonymous ? 1 : 0) : null, req.user.id);

      const updated = db.prepare('SELECT id, email, display_name, role, city, state, is_verified, is_anonymous, avatar_initial, avatar_color FROM users WHERE id = ?').get(req.user.id);
                   res.json({ user: updated });
             } catch (err) {
                   console.error('Update profile error:', err);
                   res.status(500).json({ error: 'Failed to update profile' });
             }
});

// GET /api/users/admin/list - Admin: list all users
router.get('/admin/list', authenticate, requireRole('admin', 'moderator'), (req, res) => {
    const { page = 1, limit = 50 } = req.query;
    const offset = (page - 1) * limit;

             const users = db.prepare(`
                 SELECT id, email, display_name, role, city, state, is_verified, created_at, last_login
                     FROM users ORDER BY created_at DESC LIMIT ? OFFSET ?
                       `).all(parseInt(limit), parseInt(offset));

             const { total } = db.prepare('SELECT COUNT(*) as total FROM users').get();

             res.json({ users, total, page: parseInt(page), limit: parseInt(limit) });
});

module.exports = router;
