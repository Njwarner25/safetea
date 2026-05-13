/**
 * POST /api/push/register-token
 *
 * Authenticated. Stores the caller's device push token on their user row.
 * Called by the iOS / Android clients after the OS hands them an APNs or
 * FCM device token (Capacitor `@capacitor/push-notifications` registration
 * listener on iOS; the equivalent FCM-token callback on Android).
 *
 * Body: { token: string, platform: 'ios' | 'android' | 'web' }
 * Resp: { success: true }
 *
 * Notes:
 *   - Idempotent: re-registering with a new token simply UPDATEs the row.
 *   - Platform is whitelisted to the three allowed strings to keep the
 *     column tidy and to give services/push/index.js a clean branch key.
 *   - We bump push_token_updated_at on every write so stale tokens can be
 *     identified (and eventually pruned by a cleanup job once we know how
 *     APNs/FCM are reporting unregistered devices back to us).
 */

const { run } = require('../_utils/db');
const { authenticate, cors, parseBody } = require('../_utils/auth');

const ALLOWED_PLATFORMS = ['ios', 'android', 'web'];

module.exports = async function handler(req, res) {
    cors(res, req);

    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    try {
        const body = await parseBody(req);
        const token = body && body.token ? String(body.token).trim() : '';
        const platform = body && body.platform ? String(body.platform).trim().toLowerCase() : '';

        if (!token) {
            return res.status(400).json({ error: 'token is required' });
        }
        if (!ALLOWED_PLATFORMS.includes(platform)) {
            return res.status(400).json({ error: 'platform must be one of: ios, android, web' });
        }

        // Defensive lazy ALTERs — in case the schema reconcile migration
        // has not yet run on this environment. Cheap and idempotent.
        try {
            await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token TEXT');
            await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_platform VARCHAR(16)');
            await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_opted_in BOOLEAN DEFAULT TRUE');
            await run('ALTER TABLE users ADD COLUMN IF NOT EXISTS push_token_updated_at TIMESTAMPTZ');
        } catch (e) { /* best-effort */ }

        await run(
            'UPDATE users SET push_token = $1, push_platform = $2, push_token_updated_at = NOW() WHERE id = $3',
            [token, platform, user.id]
        );

        return res.status(200).json({ success: true });
    } catch (err) {
        console.error('[push/register-token] error:', err && err.message);
        return res.status(500).json({ error: 'Internal server error' });
    }
};
