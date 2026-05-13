/**
 * POST /api/admin/push-test
 *
 * Admin-only operator tool. Fires a single push at a specified user via
 * services/push to validate that the APNs / FCM pipe is correctly
 * configured before any real feature wires into it.
 *
 * Body: { userId: number, title: string, body: string }
 * Resp: the raw result object from sendPush(), e.g.
 *   { platform: 'ios', sent: true }
 *   { platform: 'android', sent: false, error: '...' }
 *   { platform: 'ios', sent: false, skipped: true, reason: 'not_configured' }
 */

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { sendPush } = require('../../services/push');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

    try {
        const body = await parseBody(req);
        const userId = body && body.userId ? Number(body.userId) : null;
        const title = body && body.title ? String(body.title) : 'Test notification';
        const msgBody = body && body.body ? String(body.body) : 'This is a test from the admin console.';

        if (!userId || Number.isNaN(userId)) {
            return res.status(400).json({ error: 'userId (number) is required' });
        }

        const result = await sendPush({
            userId,
            title,
            body: msgBody,
            data: { type: 'admin_test', sent_by: user.id },
        });

        return res.status(200).json(result);
    } catch (err) {
        console.error('[admin/push-test] error:', err && err.message);
        return res.status(500).json({ error: 'Internal server error: ' + (err && err.message) });
    }
};
