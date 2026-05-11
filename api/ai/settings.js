/**
 * GET  /api/ai/settings  — fetch the user's AI Companion settings (or null).
 * PUT  /api/ai/settings  — upsert settings.
 *   Body: { companion_name, avatar_style, theme_color, tone }
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const VALID_AVATARS = new Set(['soft_guardian', 'shield', 'heart_link', 'moon_safety', 'minimal_icon']);
const VALID_THEMES  = new Set(['safetea_coral', 'rose_gold', 'midnight', 'soft_lavender']);
const VALID_TONES   = new Set(['calm', 'gentle', 'encouraging', 'direct']);

function clean(v, max) {
    return String(v == null ? '' : v).trim().slice(0, max);
}

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        if (req.method === 'GET') {
            const row = await getOne(
                `SELECT companion_name, avatar_style, theme_color, tone, onboarded_at, updated_at
                 FROM ai_companion_settings WHERE user_id = $1`,
                [user.id]
            );
            return res.status(200).json({ settings: row || null });
        }

        if (req.method === 'PUT') {
            const body = await parseBody(req);
            const name = clean(body.companion_name, 40);
            if (!name) return res.status(400).json({ error: 'companion_name required' });

            const avatar = VALID_AVATARS.has(body.avatar_style) ? body.avatar_style : 'soft_guardian';
            const theme  = VALID_THEMES.has(body.theme_color)  ? body.theme_color  : 'safetea_coral';
            const tone   = VALID_TONES.has(body.tone)          ? body.tone         : 'gentle';

            await run(
                `INSERT INTO ai_companion_settings (user_id, companion_name, avatar_style, theme_color, tone)
                 VALUES ($1, $2, $3, $4, $5)
                 ON CONFLICT (user_id) DO UPDATE
                   SET companion_name = EXCLUDED.companion_name,
                       avatar_style   = EXCLUDED.avatar_style,
                       theme_color    = EXCLUDED.theme_color,
                       tone           = EXCLUDED.tone,
                       updated_at     = NOW()`,
                [user.id, name, avatar, theme, tone]
            );

            const row = await getOne(
                `SELECT companion_name, avatar_style, theme_color, tone, onboarded_at, updated_at
                 FROM ai_companion_settings WHERE user_id = $1`,
                [user.id]
            );
            return res.status(200).json({ settings: row });
        }

        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[ai/settings]', err);
        return res.status(500).json({ error: 'Server error' });
    }
};
