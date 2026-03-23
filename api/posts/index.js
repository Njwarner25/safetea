const { getMany, getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');
const { checkNewPostAgainstWatchedNames } = require('../_utils/namewatch');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    try {
        if (req.method === 'GET') {
            const { city, category, feed, page = 1, limit = 20 } = req.query;
            const offset = (parseInt(page) - 1) * parseInt(limit);
            let where = [];
            let params = [];
            let idx = 1;

            if (city) { where.push('p.city = $' + idx++); params.push(city); }
            if (category) { where.push('p.category = $' + idx++); params.push(category); }

            let posts;
            try {
                // Try with feed column
                if (feed) { where.push('p.feed = $' + idx++); params.push(feed); }
                const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
                params.push(parseInt(limit), offset);

                posts = await getMany(
                    'SELECT p.*, u.display_name as author_name, u.role as author_role, ' +
                    '(SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) as reply_count ' +
                    'FROM posts p JOIN users u ON p.user_id = u.id ' +
                    whereClause + ' ' +
                    'ORDER BY reply_count DESC, p.created_at DESC LIMIT $' + (params.length - 1) + ' OFFSET $' + params.length,
                    params
                );
            } catch (colErr) {
                // Fallback: feed column may not exist yet
                console.log('Feed column query failed, falling back:', colErr.message);
                where = [];
                params = [];
                idx = 1;
                if (city) { where.push('p.city = $' + idx++); params.push(city); }
                if (category) { where.push('p.category = $' + idx++); params.push(category); }
                const whereClause = where.length ? 'WHERE ' + where.join(' AND ') : '';
                params.push(parseInt(limit), offset);

                posts = await getMany(
                    'SELECT p.*, u.display_name as author_name, u.role as author_role, ' +
                    '(SELECT COUNT(*) FROM replies r WHERE r.post_id = p.id) as reply_count ' +
                    'FROM posts p JOIN users u ON p.user_id = u.id ' +
                    whereClause + ' ' +
                    'ORDER BY reply_count DESC, p.created_at DESC LIMIT $' + (params.length - 1) + ' OFFSET $' + params.length,
                    params
                );
            }

            // Process image expiry (safe - only if columns exist on the row)
            const now = new Date();
            if (posts && posts.length > 0) {
                posts.forEach(function(post) {
                    if (post.image_url && post.image_expires_at) {
                        const expiresAt = new Date(post.image_expires_at);
                        if (now > expiresAt) {
                            post.image_url = null;
                            post.image_expired = true;
                        } else {
                            const daysLeft = Math.ceil((expiresAt - now) / (1000 * 60 * 60 * 24));
                            post.image_days_left = daysLeft;
                        }
                    }
                });
            }

            return res.status(200).json(posts);
        }

        if (req.method === 'POST') {
            const user = await authenticate(req);
            if (!user) return res.status(401).json({ error: 'Not authenticated' });

            const { title, body, category, city, feed, image_url } = req.body;
            if (!title || !body) {
                return res.status(400).json({ error: 'Title and body are required' });
            }

            let result;
            try {
                // Try insert with new columns
                let imageExpiresAt = null;
                if (image_url) {
                    imageExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
                }

                result = await getOne(
                    'INSERT INTO posts (user_id, title, body, category, city, feed, image_url, image_expires_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *',
                    [user.id, title, body, category || 'general', city || user.city, feed || 'community', image_url || null, imageExpiresAt]
                );
            } catch (insertErr) {
                // Fallback: new columns may not exist yet
                console.log('Full insert failed, falling back:', insertErr.message);
                result = await getOne(
                    'INSERT INTO posts (user_id, title, body, category, city) VALUES ($1, $2, $3, $4, $5) RETURNING *',
                    [user.id, title, body, category || 'general', city || user.city]
                );
            }

            // Check new post against watched names (non-blocking)
            if (result && result.id) {
                checkNewPostAgainstWatchedNames(result.id, body, city || user.city).catch(err => {
                    console.error('Name Watch matching error:', err);
                });
            }

            return res.status(201).json({ message: 'Post created', post: result });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Posts error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
