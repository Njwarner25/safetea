/**
 * services/push/index.js — single entrypoint for server-initiated push.
 *
 * Usage:
 *   const { sendPush } = require('../../services/push');
 *   const result = await sendPush({
 *     userId: 123,
 *     title: 'Heads up',
 *     body: 'Tap to open the app.',
 *     data: { type: 'system', route: '/dashboard' },
 *   });
 *
 * Returns one of:
 *   { sent: true, platform, messageId? }
 *   { sent: false, skipped: true, reason }            // graceful degradation
 *   { sent: false, error: '<message>' }                // hard failure (logged to push_sends.error)
 *
 * Behavior:
 *   1. Look up the user's stored device token + platform + opt-in flag.
 *      Missing token, missing platform, or opt-out => skipped.
 *   2. Insert a row in push_sends with status='pending' so we have an
 *      audit trail even if the dispatch crashes.
 *   3. Branch to ./apns (iOS) or ./fcm (Android). Both modules are
 *      dynamic-required inside try/catch so a missing package or env var
 *      degrades to { skipped: true, reason: 'not_configured' } rather
 *      than 500-ing the caller.
 *   4. UPDATE push_sends to 'sent' or 'failed' once dispatch returns.
 *
 * Web push (platform='web') is reserved for future VAPID/WebPush wiring;
 * currently returns { skipped: true, reason: 'web_push_not_implemented' }.
 */

const { getOne, run, query } = require('../../api/_utils/db');

async function sendPush({ userId, title, body, data }) {
    if (!userId) {
        return { sent: false, error: 'userId is required' };
    }

    // 1. Lookup user's push state.
    let userRow;
    try {
        userRow = await getOne(
            'SELECT id, push_token, push_platform, push_opted_in FROM users WHERE id = $1',
            [userId]
        );
    } catch (e) {
        // Most likely the migration has not run yet (columns missing).
        console.error('[push] lookup failed:', e && e.message);
        return { sent: false, skipped: true, reason: 'schema_not_ready' };
    }

    if (!userRow) return { sent: false, skipped: true, reason: 'user_not_found' };
    if (!userRow.push_token) return { sent: false, skipped: true, reason: 'no_token' };
    if (!userRow.push_platform) return { sent: false, skipped: true, reason: 'no_platform' };
    if (userRow.push_opted_in === false) {
        return { sent: false, skipped: true, reason: 'opted_out' };
    }

    const platform = String(userRow.push_platform).toLowerCase();
    const token = userRow.push_token;

    // 2. Audit row (pending) — best-effort. If the table doesn't exist yet,
    //    we still try to dispatch so the pipe doesn't fully hard-fail.
    let sendId = null;
    try {
        const result = await query(
            `INSERT INTO push_sends (user_id, title, body, data, platform, status)
             VALUES ($1, $2, $3, $4, $5, 'pending') RETURNING id`,
            [userId, title || null, body || null, data ? JSON.stringify(data) : null, platform]
        );
        sendId = result && result.rows && result.rows[0] && result.rows[0].id;
    } catch (e) {
        console.error('[push] audit insert failed (continuing):', e && e.message);
    }

    // 3. Dispatch — dynamic-require each platform module so missing config
    //    or missing optional npm packages degrade gracefully.
    let dispatch;
    try {
        if (platform === 'ios') {
            // eslint-disable-next-line global-require
            const apns = require('./apns');
            dispatch = await apns.send({ token, title, body, data });
        } else if (platform === 'android') {
            // eslint-disable-next-line global-require
            const fcm = require('./fcm');
            dispatch = await fcm.send({ token, title, body, data });
        } else if (platform === 'web') {
            dispatch = { sent: false, skipped: true, reason: 'web_push_not_implemented' };
        } else {
            dispatch = { sent: false, skipped: true, reason: 'unknown_platform' };
        }
    } catch (e) {
        console.error('[push] dispatch threw:', e && e.message);
        dispatch = { sent: false, error: e && e.message ? e.message : String(e) };
    }

    // 4. Update audit row.
    if (sendId) {
        let nextStatus;
        let errStr = null;
        if (dispatch.sent) {
            nextStatus = 'sent';
        } else if (dispatch.skipped) {
            nextStatus = 'skipped';
            errStr = dispatch.reason || null;
        } else {
            nextStatus = 'failed';
            errStr = dispatch.error || 'unknown_failure';
        }
        try {
            await run(
                'UPDATE push_sends SET status = $1, error = $2 WHERE id = $3',
                [nextStatus, errStr, sendId]
            );
        } catch (e) {
            console.error('[push] audit update failed (non-fatal):', e && e.message);
        }
    }

    return Object.assign({ platform }, dispatch);
}

module.exports = { sendPush };
