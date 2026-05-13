/**
 * services/push/fcm.js — Firebase Cloud Messaging HTTP v1 sender.
 *
 * Required env:
 *   FCM_SERVICE_ACCOUNT_JSON — the full service-account JSON, stringified
 *                              (NOT a file path; we parse it from the env
 *                               var at runtime so it can live in Vercel
 *                               Project Settings unchanged).
 *
 * The JSON is the standard one downloaded from
 * https://console.firebase.google.com/  → Project Settings → Service Accounts
 * → "Generate new private key". It must include:
 *   - project_id
 *   - client_email
 *   - private_key  (a PEM string with literal '\n' newlines)
 *
 * We mint an OAuth 2.0 access token via the JWT-bearer grant against
 * https://oauth2.googleapis.com/token (scope:
 * https://www.googleapis.com/auth/firebase.messaging), cache it for ~55
 * minutes, then POST the FCM payload to
 *   https://fcm.googleapis.com/v1/projects/<project_id>/messages:send
 *
 * If the env var is missing OR jsonwebtoken can't be required, we return
 * { sent: false, skipped: true, reason: 'not_configured' }.
 */

const FCM_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const FCM_SCOPE = 'https://www.googleapis.com/auth/firebase.messaging';

let cachedAccessToken = null;
let cachedAccessTokenExpiresAt = 0;
const ACCESS_TOKEN_TTL_MS = 55 * 60 * 1000;

function parseServiceAccount() {
    const raw = process.env.FCM_SERVICE_ACCOUNT_JSON;
    if (!raw) return null;
    try {
        const sa = typeof raw === 'string' ? JSON.parse(raw) : raw;
        if (!sa || !sa.project_id || !sa.client_email || !sa.private_key) return null;
        // private_key in Vercel env vars often has the newlines escaped as '\n'.
        // Restore real newlines so jsonwebtoken can parse the PEM.
        if (sa.private_key.indexOf('\\n') !== -1) {
            sa.private_key = sa.private_key.replace(/\\n/g, '\n');
        }
        return sa;
    } catch (e) {
        console.error('[fcm] FCM_SERVICE_ACCOUNT_JSON parse failed:', e && e.message);
        return null;
    }
}

async function getAccessToken(sa) {
    const now = Date.now();
    if (cachedAccessToken && cachedAccessTokenExpiresAt > now) return cachedAccessToken;

    let jwt;
    try {
        jwt = require('jsonwebtoken');
    } catch (e) {
        throw new Error('jsonwebtoken not installed');
    }

    const iat = Math.floor(now / 1000);
    const assertion = jwt.sign(
        {
            iss: sa.client_email,
            scope: FCM_SCOPE,
            aud: FCM_TOKEN_URL,
            iat,
            exp: iat + 3600,
        },
        sa.private_key,
        { algorithm: 'RS256' }
    );

    const tokenResp = await fetch(FCM_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
            grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
            assertion,
        }).toString(),
    });

    if (!tokenResp.ok) {
        const txt = await tokenResp.text().catch(function () { return ''; });
        throw new Error('fcm_token_http_' + tokenResp.status + ': ' + txt);
    }

    const tokenJson = await tokenResp.json();
    if (!tokenJson.access_token) {
        throw new Error('fcm_token_missing_access_token');
    }

    cachedAccessToken = tokenJson.access_token;
    cachedAccessTokenExpiresAt = now + ACCESS_TOKEN_TTL_MS;
    return cachedAccessToken;
}

async function send({ token, title, body, data }) {
    const sa = parseServiceAccount();
    if (!sa) {
        return { sent: false, skipped: true, reason: 'not_configured' };
    }

    let accessToken;
    try {
        accessToken = await getAccessToken(sa);
    } catch (e) {
        console.error('[fcm] getAccessToken failed:', e && e.message);
        return { sent: false, error: 'fcm_auth: ' + (e && e.message) };
    }

    // FCM v1 `data` payload values must be strings — stringify non-strings.
    let dataPayload;
    if (data && typeof data === 'object') {
        dataPayload = {};
        for (const k of Object.keys(data)) {
            const v = data[k];
            dataPayload[k] = typeof v === 'string' ? v : JSON.stringify(v);
        }
    }

    const message = {
        token,
        notification: { title: title || '', body: body || '' },
    };
    if (dataPayload) message.data = dataPayload;

    const url = 'https://fcm.googleapis.com/v1/projects/' + encodeURIComponent(sa.project_id) + '/messages:send';

    try {
        const resp = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': 'Bearer ' + accessToken,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ message }),
        });

        if (resp.ok) {
            let messageId = null;
            try {
                const j = await resp.json();
                messageId = j && j.name ? j.name : null;
            } catch (_) { /* swallow */ }
            return { sent: true, messageId };
        }

        const txt = await resp.text().catch(function () { return ''; });
        return { sent: false, error: 'fcm_http_' + resp.status + ': ' + txt.slice(0, 300) };
    } catch (e) {
        return { sent: false, error: 'fcm_send: ' + (e && e.message) };
    }
}

module.exports = { send };
