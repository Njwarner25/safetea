/**
 * services/push/apns.js — APNs HTTP/2 Provider API sender.
 *
 * Required env:
 *   APNS_KEY_ID       — 10-char key ID from Apple Developer Console
 *   APNS_TEAM_ID      — 10-char team ID
 *   APNS_BUNDLE_ID    — e.g. 'app.linkher.mobile' (the iOS app bundle)
 *   APNS_PRIVATE_KEY  — full PEM contents of the .p8 file (BEGIN/END lines included)
 * Optional:
 *   APNS_PRODUCTION   — 'true' → api.push.apple.com, anything else → sandbox
 *
 * Strategy:
 *   - Prefer the `apn` npm package if installed (it manages the HTTP/2
 *     connection pool, retries, and JWT refresh).
 *   - Fall back to node:http2 + JWT we build ourselves with `jsonwebtoken`.
 *   - If env vars are missing or both transports fail to load, return
 *     { sent: false, skipped: true, reason: 'not_configured' }.
 *
 * This file deliberately holds no module-level singletons that would
 * crash require() — env reads + dynamic requires all happen inside send().
 */

const APNS_HOST_PROD = 'api.push.apple.com';
const APNS_HOST_DEV = 'api.sandbox.push.apple.com';
const APNS_PORT = 443;

function readEnv() {
    return {
        keyId: process.env.APNS_KEY_ID,
        teamId: process.env.APNS_TEAM_ID,
        bundleId: process.env.APNS_BUNDLE_ID,
        privateKey: process.env.APNS_PRIVATE_KEY,
        production: String(process.env.APNS_PRODUCTION || '').toLowerCase() === 'true',
    };
}

function envReady(env) {
    return !!(env.keyId && env.teamId && env.bundleId && env.privateKey);
}

// In-process JWT cache. APNs requires the provider token be refreshed
// at least every 60 minutes; we refresh every 50 to be safe.
let cachedJwt = null;
let cachedJwtExpiresAt = 0;
const JWT_TTL_MS = 50 * 60 * 1000;

function buildProviderJwt(env) {
    const now = Date.now();
    if (cachedJwt && cachedJwtExpiresAt > now) return cachedJwt;

    let jwt;
    try {
        jwt = require('jsonwebtoken');
    } catch (e) {
        throw new Error('jsonwebtoken not installed');
    }

    const token = jwt.sign(
        { iss: env.teamId, iat: Math.floor(now / 1000) },
        env.privateKey,
        { algorithm: 'ES256', header: { alg: 'ES256', kid: env.keyId } }
    );

    cachedJwt = token;
    cachedJwtExpiresAt = now + JWT_TTL_MS;
    return token;
}

async function sendViaApnPackage(env, { token, title, body, data }) {
    let apn;
    try {
        apn = require('apn');
    } catch (e) {
        return null; // signal "package unavailable" to caller
    }

    const provider = new apn.Provider({
        token: {
            key: env.privateKey,
            keyId: env.keyId,
            teamId: env.teamId,
        },
        production: env.production,
    });

    try {
        const note = new apn.Notification();
        note.alert = { title: title || '', body: body || '' };
        note.topic = env.bundleId;
        note.sound = 'default';
        if (data && typeof data === 'object') note.payload = data;
        const result = await provider.send(note, token);
        const failure = result && result.failed && result.failed[0];
        if (failure) {
            return { sent: false, error: (failure.response && failure.response.reason) || failure.error || 'apns_failed' };
        }
        return { sent: true };
    } finally {
        try { provider.shutdown(); } catch (_) { /* noop */ }
    }
}

async function sendViaHttp2(env, { token, title, body, data }) {
    let http2;
    try {
        http2 = require('node:http2');
    } catch (e) {
        try { http2 = require('http2'); } catch (e2) {
            throw new Error('http2 module not available');
        }
    }

    const providerJwt = buildProviderJwt(env);
    const host = env.production ? APNS_HOST_PROD : APNS_HOST_DEV;

    const payload = JSON.stringify({
        aps: {
            alert: { title: title || '', body: body || '' },
            sound: 'default',
        },
        ...(data && typeof data === 'object' ? data : {}),
    });

    return await new Promise(function (resolve) {
        let settled = false;
        function done(value) {
            if (settled) return;
            settled = true;
            try { client.close(); } catch (_) { /* noop */ }
            resolve(value);
        }

        const client = http2.connect('https://' + host + ':' + APNS_PORT);
        client.on('error', function (err) {
            done({ sent: false, error: 'apns_connect: ' + (err && err.message) });
        });

        const req = client.request({
            ':method': 'POST',
            ':path': '/3/device/' + token,
            'authorization': 'bearer ' + providerJwt,
            'apns-topic': env.bundleId,
            'apns-push-type': 'alert',
            'content-type': 'application/json',
            'content-length': Buffer.byteLength(payload),
        });

        let status = 0;
        let respBody = '';
        req.on('response', function (headers) {
            status = headers[':status'] || 0;
        });
        req.setEncoding('utf8');
        req.on('data', function (chunk) { respBody += chunk; });
        req.on('end', function () {
            if (status >= 200 && status < 300) {
                done({ sent: true });
            } else {
                let reason = 'apns_http_' + status;
                try {
                    const parsed = JSON.parse(respBody || '{}');
                    if (parsed && parsed.reason) reason = parsed.reason;
                } catch (_) { /* keep generic reason */ }
                done({ sent: false, error: reason });
            }
        });
        req.on('error', function (err) {
            done({ sent: false, error: 'apns_req: ' + (err && err.message) });
        });

        req.write(payload);
        req.end();
    });
}

async function send({ token, title, body, data }) {
    const env = readEnv();
    if (!envReady(env)) {
        return { sent: false, skipped: true, reason: 'not_configured' };
    }

    // Prefer the `apn` package if installed (handles connection pooling).
    try {
        const apnResult = await sendViaApnPackage(env, { token, title, body, data });
        if (apnResult !== null) return apnResult;
    } catch (e) {
        console.error('[apns] apn package send threw:', e && e.message);
        // fall through to http2 fallback
    }

    try {
        return await sendViaHttp2(env, { token, title, body, data });
    } catch (e) {
        console.error('[apns] http2 fallback failed:', e && e.message);
        return { sent: false, error: 'apns_unavailable: ' + (e && e.message) };
    }
}

module.exports = { send };
