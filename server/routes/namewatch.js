const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { body, validationResult } = require('express-validator');
const { getOne, getAll, query } = require('../db/database');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

// Middleware: require Pro tier (subscription_tier = 'premium' OR admin/moderator)
function requirePro(req, res, next) {
  if (!req.user) return res.status(401).json({ error: 'Authentication required' });
  if (req.user.subscription_tier === 'premium' || req.user.role === 'admin' || req.user.role === 'moderator') {
    return next();
  }
  return res.status(403).json({
    error: 'Pro subscription required',
    upgrade: true,
    message: 'Name Watch requires SafeTea Pro ($9.99/mo). Upgrade to monitor names and get alerts.'
  });
}

// Helper: generate search terms from a display name
function generateSearchTerms(name) {
  const terms = [];
  const clean = name.trim();
  if (!clean) return terms;

  // Add the full name as-is
  terms.push(clean.toLowerCase());

  // Split into parts
  const parts = clean.split(/\s+/);

  // Add each part individually
  parts.forEach(p => {
    const lower = p.toLowerCase().replace(/[.]/g, '');
    if (lower.length > 1 && !terms.includes(lower)) terms.push(lower);
  });

  // Add initials (e.g., "Jake Morrison" -> "jm")
  if (parts.length >= 2) {
    const initials = parts.map(p => p[0]).join('').toLowerCase();
    if (!terms.includes(initials)) terms.push(initials);
  }

  // Add "FirstName LastInitial" pattern (e.g., "Jake M", "Jake M.")
  if (parts.length >= 2) {
    const firstLast = (parts[0] + ' ' + parts[parts.length - 1][0]).toLowerCase();
    if (!terms.includes(firstLast)) terms.push(firstLast);
    const firstLastDot = firstLast + '.';
    if (!terms.includes(firstLastDot)) terms.push(firstLastDot);
  }

  return terms;
}

// GET /api/namewatch - Get all watched names for the current user
router.get('/', authenticate, requirePro, async (req, res) => {
  try {
    const names = await getAll(
      `SELECT wn.*,
        (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id) as match_count,
        (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id AND nwm.is_read = false) as unread_count
      FROM watched_names wn
      WHERE wn.user_id = $1
      ORDER BY wn.created_at DESC`,
      [req.user.id]
    );
    res.json({ names });
  } catch (err) {
    console.error('Get watched names error:', err);
    res.status(500).json({ error: 'Failed to load watched names' });
  }
});

// GET /api/namewatch/matches - Get all matches for the current user
router.get('/matches', authenticate, requirePro, async (req, res) => {
  try {
    const matches = await getAll(
      `SELECT nwm.*, wn.display_name as watched_name,
        p.content as post_content, p.city as post_city, p.category as post_category, p.created_at as post_created_at,
        u.avatar_initial, u.avatar_color
      FROM name_watch_matches nwm
      JOIN watched_names wn ON nwm.watched_name_id = wn.id
      JOIN posts p ON nwm.post_id = p.id
      JOIN users u ON p.user_id = u.id
      WHERE wn.user_id = $1
      ORDER BY nwm.created_at DESC
      LIMIT 50`,
      [req.user.id]
    );
    res.json({ matches });
  } catch (err) {
    console.error('Get matches error:', err);
    res.status(500).json({ error: 'Failed to load matches' });
  }
});

// GET /api/namewatch/unread - Get unread match count
router.get('/unread', authenticate, requirePro, async (req, res) => {
  try {
    const result = await getOne(
      `SELECT COUNT(*) as count FROM name_watch_matches nwm
       JOIN watched_names wn ON nwm.watched_name_id = wn.id
       WHERE wn.user_id = $1 AND nwm.is_read = false`,
      [req.user.id]
    );
    res.json({ count: parseInt(result.count) });
  } catch (err) {
    console.error('Get unread count error:', err);
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// POST /api/namewatch - Add a new watched name
router.post('/', authenticate, requirePro, [
  body('name').trim().isLength({ min: 2, max: 100 }).withMessage('Name must be 2-100 characters')
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ errors: errors.array() });
  }

  const { name } = req.body;

  try {
    // Check for duplicates
    const existing = await getOne(
      'SELECT id FROM watched_names WHERE user_id = $1 AND LOWER(display_name) = LOWER($2)',
      [req.user.id, name.trim()]
    );
    if (existing) {
      return res.status(409).json({ error: 'You are already watching this name' });
    }

    // Limit to 20 watched names
    const countResult = await getOne(
      'SELECT COUNT(*) as count FROM watched_names WHERE user_id = $1',
      [req.user.id]
    );
    if (parseInt(countResult.count) >= 20) {
      return res.status(400).json({ error: 'Maximum of 20 watched names allowed' });
    }

    const id = uuidv4();
    const searchTerms = generateSearchTerms(name);

    await query(
      'INSERT INTO watched_names (id, user_id, display_name, search_terms) VALUES ($1, $2, $3, $4)',
      [id, req.user.id, name.trim(), searchTerms]
    );

    // Scan existing posts for matches
    await scanExistingPosts(id, searchTerms, req.user.city);

    const watchedName = await getOne(
      `SELECT wn.*,
        (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id) as match_count
      FROM watched_names wn WHERE wn.id = $1`,
      [id]
    );

    res.status(201).json({ name: watchedName });
  } catch (err) {
    console.error('Add watched name error:', err);
    res.status(500).json({ error: 'Failed to add watched name' });
  }
});

// DELETE /api/namewatch/:id - Remove a watched name
router.delete('/:id', authenticate, requirePro, async (req, res) => {
  try {
    const name = await getOne(
      'SELECT id FROM watched_names WHERE id = $1 AND user_id = $2',
      [req.params.id, req.user.id]
    );
    if (!name) {
      return res.status(404).json({ error: 'Watched name not found' });
    }

    await query('DELETE FROM watched_names WHERE id = $1', [req.params.id]);
    res.json({ success: true });
  } catch (err) {
    console.error('Delete watched name error:', err);
    res.status(500).json({ error: 'Failed to remove watched name' });
  }
});

// PUT /api/namewatch/matches/:id/read - Mark a match as read
router.put('/matches/:id/read', authenticate, requirePro, async (req, res) => {
  try {
    await query(
      `UPDATE name_watch_matches SET is_read = true
       WHERE id = $1 AND watched_name_id IN (SELECT id FROM watched_names WHERE user_id = $2)`,
      [req.params.id, req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark match read error:', err);
    res.status(500).json({ error: 'Failed to mark match as read' });
  }
});

// PUT /api/namewatch/matches/read-all - Mark all matches as read
router.put('/matches/read-all', authenticate, requirePro, async (req, res) => {
  try {
    await query(
      `UPDATE name_watch_matches SET is_read = true
       WHERE watched_name_id IN (SELECT id FROM watched_names WHERE user_id = $1)`,
      [req.user.id]
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Mark all read error:', err);
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// Helper: scan existing posts for a newly added watched name
async function scanExistingPosts(watchedNameId, searchTerms, userCity) {
  try {
    // Get recent posts from user's city (last 30 days)
    const posts = await getAll(
      `SELECT id, content FROM posts
       WHERE city = $1 AND created_at > NOW() - INTERVAL '30 days'
       ORDER BY created_at DESC LIMIT 200`,
      [userCity]
    );

    for (const post of posts) {
      const contentLower = post.content.toLowerCase();
      for (const term of searchTerms) {
        if (contentLower.includes(term)) {
          const matchType = term.length <= 3 ? 'initials' : (contentLower.includes(term) ? 'exact' : 'partial');
          try {
            await query(
              `INSERT INTO name_watch_matches (id, watched_name_id, post_id, match_type, matched_term)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT (watched_name_id, post_id) DO NOTHING`,
              [uuidv4(), watchedNameId, post.id, matchType, term]
            );
          } catch (e) {
            // Ignore duplicate constraint errors
          }
          break; // Only one match per post
        }
      }
    }

    // Update match count
    const countResult = await getOne(
      'SELECT COUNT(*) as count FROM name_watch_matches WHERE watched_name_id = $1',
      [watchedNameId]
    );
    await query(
      'UPDATE watched_names SET match_count = $1 WHERE id = $2',
      [parseInt(countResult.count), watchedNameId]
    );
  } catch (err) {
    console.error('Scan existing posts error:', err);
  }
}

// Export the matching function so posts route can call it when a new post is created
async function checkNewPostAgainstWatchedNames(postId, postContent, postCity) {
  try {
    // Get all watched names for users in this city
    const watchedNames = await getAll(
      `SELECT wn.id, wn.search_terms, wn.user_id FROM watched_names wn
       JOIN users u ON wn.user_id = u.id
       WHERE u.city = $1`,
      [postCity]
    );

    const contentLower = postContent.toLowerCase();

    for (const wn of watchedNames) {
      const terms = wn.search_terms || [];
      for (const term of terms) {
        if (contentLower.includes(term)) {
          const matchType = term.length <= 3 ? 'initials' : 'exact';
          try {
            await query(
              `INSERT INTO name_watch_matches (id, watched_name_id, post_id, match_type, matched_term)
               VALUES ($1, $2, $3, $4, $5) ON CONFLICT (watched_name_id, post_id) DO NOTHING`,
              [uuidv4(), wn.id, postId, matchType, term]
            );
            // Update match count and last_match_at
            await query(
              `UPDATE watched_names SET
                match_count = (SELECT COUNT(*) FROM name_watch_matches WHERE watched_name_id = $1),
                last_match_at = NOW()
               WHERE id = $1`,
              [wn.id]
            );
          } catch (e) {
            // Ignore duplicate constraint errors
          }
          break;
        }
      }
    }
  } catch (err) {
    console.error('Check new post against watched names error:', err);
  }
}

module.exports = router;
module.exports.checkNewPostAgainstWatchedNames = checkNewPostAgainstWatchedNames;
