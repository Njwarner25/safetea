const { getMany, getOne, run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

function isPaidTier(user) {
    return user && (user.role === 'admin' || user.role === 'moderator' || user.subscription_tier === 'plus' || user.subscription_tier === 'pro' || user.subscription_tier === 'premium');
}

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    // Get full user with subscription_tier
    const fullUser = await getOne('SELECT id, role, city, subscription_tier FROM users WHERE id = $1', [user.id]);
    if (!isPaidTier(fullUser)) {
        return res.status(403).json({
            error: 'SafeTea+ subscription required',
            upgrade: true,
            message: 'Name Watch requires SafeTea+ ($7.99/mo).'
        });
    }

    try {
        const url = new URL(req.url, `http://${req.headers.host}`);
        const pathParts = url.pathname.replace('/api/namewatch', '').split('/').filter(Boolean);

        // GET /api/namewatch - list watched names with match counts
        if (req.method === 'GET' && pathParts.length === 0) {
            const names = await getMany(
                `SELECT wn.*,
                    (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id) as match_count,
                    (SELECT COUNT(*) FROM name_watch_matches nwm WHERE nwm.watched_name_id = wn.id AND nwm.is_read = false) as unread_count
                FROM watched_names wn
                WHERE wn.user_id::text = $1::text
                ORDER BY wn.created_at DESC`,
                [user.id]
            );

            // Also fetch recent matches for display
            var matches = [];
            try {
                matches = await getMany(
                    `SELECT nwm.*, wn.name as watched_name,
                        p.body as post_content, p.city as post_city, p.id as post_id, p.created_at as post_created_at
                    FROM name_watch_matches nwm
                    JOIN watched_names wn ON nwm.watched_name_id = wn.id
                    JOIN posts p ON nwm.post_id = p.id
                    WHERE wn.user_id::text = $1::text
                    ORDER BY nwm.created_at DESC
                    LIMIT 20`,
                    [user.id]
                );
            } catch (e) {}

            return res.status(200).json({ names, matches });
        }

        // GET /api/namewatch/matches - list all matches
        if (req.method === 'GET' && pathParts[0] === 'matches') {
            const matches = await getMany(
                `SELECT nwm.*, wn.name as watched_name,
                    p.body as post_content, p.city as post_city, p.id as post_id, p.category as post_category, p.created_at as post_created_at
                FROM name_watch_matches nwm
                JOIN watched_names wn ON nwm.watched_name_id = wn.id
                JOIN posts p ON nwm.post_id = p.id
                WHERE wn.user_id::text = $1::text
                ORDER BY nwm.created_at DESC
                LIMIT 50`,
                [user.id]
            );
            return res.status(200).json({ matches });
        }

        // GET /api/namewatch/unread - unread count
        if (req.method === 'GET' && pathParts[0] === 'unread') {
            const result = await getOne(
                `SELECT COUNT(*) as count FROM name_watch_matches nwm
                 JOIN watched_names wn ON nwm.watched_name_id = wn.id
                 WHERE wn.user_id::text = $1::text AND nwm.is_read = false`,
                [user.id]
            );
            return res.status(200).json({ count: parseInt(result.count) });
        }

        // POST /api/namewatch - add a watched name
        if (req.method === 'POST' && pathParts.length === 0) {
            const body = await parseBody(req);
            const name = body.name;
            if (!name || name.trim().length < 2) {
                return res.status(400).json({ error: 'Name must be at least 2 characters' });
            }

            const existing = await getOne(
                'SELECT id FROM watched_names WHERE user_id::text = $1::text AND LOWER(name) = LOWER($2)',
                [user.id, name.trim()]
            );
            if (existing) return res.status(409).json({ error: 'Already watching this name' });

            const countResult = await getOne('SELECT COUNT(*) as count FROM watched_names WHERE user_id::text = $1::text', [user.id]);
            if (parseInt(countResult.count) >= 20) {
                return res.status(400).json({ error: 'Maximum 20 watched names' });
            }

            const result = await getOne(
                'INSERT INTO watched_names (user_id, name) VALUES ($1, $2) RETURNING *',
                [String(user.id), name.trim()]
            );

            return res.status(201).json({ success: true, name: result });
        }

        // DELETE /api/namewatch?id=X - remove a watched name
        if (req.method === 'DELETE') {
            const body = await parseBody(req);
            const id = (req.query && req.query.id) || (body && body.id) || pathParts[0];
            if (!id) return res.status(400).json({ error: 'ID required' });

            const nameRow = await getOne(
                'SELECT id FROM watched_names WHERE id = $1 AND user_id::text = $2::text',
                [id, user.id]
            );
            if (!nameRow) return res.status(404).json({ error: 'Not found' });

            await run('DELETE FROM name_watch_matches WHERE watched_name_id = $1', [id]);
            await run('DELETE FROM watched_names WHERE id = $1', [id]);
            return res.status(200).json({ success: true });
        }

        // PUT /api/namewatch/matches/read-all - mark all as read
        if (req.method === 'PUT' && pathParts[0] === 'matches' && pathParts[1] === 'read-all') {
            await run(
                `UPDATE name_watch_matches SET is_read = true
                 WHERE watched_name_id IN (SELECT id FROM watched_names WHERE user_id::text = $1::text)`,
                [user.id]
            );
            return res.status(200).json({ success: true });
        }

        // PUT /api/namewatch/matches/:id/read - mark one as read
        if (req.method === 'PUT' && pathParts[0] === 'matches' && pathParts[1] && pathParts[2] === 'read') {
            await run(
                `UPDATE name_watch_matches SET is_read = true
                 WHERE id = $1 AND watched_name_id IN (SELECT id FROM watched_names WHERE user_id::text = $2::text)`,
                [pathParts[1], user.id]
            );
            return res.status(200).json({ success: true });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Name Watch error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
