const { getOne, run } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
        if (req.method === 'GET') {
            const fullUser = await getOne(
                'SELECT id, email, display_name, role, city, bio, avatar_type, avatar_color, avatar_initial, avatar_url, custom_display_name, created_at FROM users WHERE id = $1',
                [user.id]
            );
            return res.status(200).json({ user: fullUser || user });
        }

        if (req.method === 'PUT') {
            const { display_name, city, bio, avatar_type, avatar_color, avatar_initial, avatar_url, custom_display_name } = req.body;

            // Build dynamic update query based on what fields are provided
            const fields = [];
            const values = [];
            let idx = 1;

            if (display_name !== undefined) { fields.push('display_name = $' + idx++); values.push(display_name); }
            if (city !== undefined) { fields.push('city = $' + idx++); values.push(city); }
            if (bio !== undefined) { fields.push('bio = $' + idx++); values.push(bio); }
            if (avatar_type !== undefined) { fields.push('avatar_type = $' + idx++); values.push(avatar_type); }
            if (avatar_color !== undefined) { fields.push('avatar_color = $' + idx++); values.push(avatar_color); }
            if (avatar_initial !== undefined) { fields.push('avatar_initial = $' + idx++); values.push(avatar_initial); }
            if (avatar_url !== undefined) { fields.push('avatar_url = $' + idx++); values.push(avatar_url); }
            if (custom_display_name !== undefined) { fields.push('custom_display_name = $' + idx++); values.push(custom_display_name); }

            fields.push('updated_at = NOW()');

            if (fields.length > 1) {
                values.push(user.id);
                await run(
                    'UPDATE users SET ' + fields.join(', ') + ' WHERE id = $' + idx,
                    values
                );
            }

            const updated = await getOne(
                'SELECT id, email, display_name, role, city, bio, avatar_type, avatar_color, avatar_initial, avatar_url, custom_display_name, created_at FROM users WHERE id = $1',
                [user.id]
            );

            return res.status(200).json({ user: updated });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
        console.error('Profile error:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
