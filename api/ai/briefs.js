/**
 * GET /api/ai/briefs?lat=<f>&lng=<f>&local_hour=<0..23>
 *
 * Returns { briefs: [...] } where each brief has:
 *   { id, type, icon, body, severity, actions: [...] }
 *
 * Layered sources (each layer can be empty; the frontend handles empty):
 *   1) NWS weather/environmental alerts  — free, US-wide, real-time
 *   2) Time-of-day awareness             — calm "nighttime mode" cue
 *   3) Community-reported incidents      — stub (DB table arrives later)
 *   4) Crime-adapter slot                — stub; plug in SpotCrime/etc. via env
 *
 * Tone rules per Alessia spec:
 *   - never "danger / unsafe / attack / crime is likely"
 *   - prefer "reported incidents", "recent activity", "consider", "Alessia noticed"
 *
 * In-memory 5-min cache keyed by rounded coord bucket so we don't hammer NWS.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');

const CACHE = new Map();              // key -> { at, briefs }
const CACHE_TTL_MS = 5 * 60 * 1000;
const NWS_USER_AGENT = '(LinkHer SafeTea Companion, contact: njwarner25@gmail.com)';

function bucket(n) { return (Math.round(n * 20) / 20).toFixed(2); }      // ~5km buckets
function inUS(lat, lng) {
    return (lat >= 24 && lat <= 49 && lng >= -125 && lng <= -66) ||      // continental
           (lat >= 51 && lat <= 71 && lng >= -180 && lng <= -130) ||     // alaska
           (lat >= 18 && lat <= 23 && lng >= -161 && lng <= -154);       // hawaii
}

function calmifyEvent(eventType) {
    // NWS event names like "Severe Thunderstorm Warning" → strip "Warning/Watch" since
    // we present them in our own calm wrapper.
    return String(eventType || '').replace(/\s*(Warning|Watch|Advisory|Statement)\s*$/i, '').trim();
}

async function fetchNWSAlerts(lat, lng) {
    if (!inUS(lat, lng)) return [];
    const url = `https://api.weather.gov/alerts/active?point=${lat.toFixed(4)},${lng.toFixed(4)}`;
    try {
        const res = await fetch(url, { headers: { 'User-Agent': NWS_USER_AGENT, 'Accept': 'application/geo+json' } });
        if (!res.ok) return [];
        const data = await res.json();
        const features = (data && data.features) || [];
        return features.slice(0, 3).map(function (f, i) {
            const p = f.properties || {};
            const ev = calmifyEvent(p.event);
            // Pick a calm, supportive body. Prefer headline; fall back to event.
            const body = (p.headline || p.event || 'A weather alert is active in your area') +
                         '. Consider delaying travel or using a safer indoor pickup location if your plans take you outside.';
            return {
                id: 'nws-' + (p.id || i),
                type: 'WEATHER',
                icon: 'fa-cloud-bolt',
                body: body,
                severity: (p.severity || 'unknown').toLowerCase(),
                actions: ['dismiss'],
            };
        });
    } catch (e) { return []; }
}

function timeOfDayBrief(localHour) {
    if (typeof localHour !== 'number' || isNaN(localHour)) return null;
    if (localHour < 22 && localHour >= 5) return null;                   // 5am–10pm = no nighttime brief
    return {
        id: 'tod-night',
        type: 'NIGHTTIME',
        icon: 'fa-moon',
        body: "It's getting late. If your route takes you somewhere less populated, you may want to start a Safe Walk session or share your live location with a trusted contact.",
        severity: 'gentle',
        actions: ['safe_walk', 'share_location', 'dismiss'],
    };
}

async function fetchCommunityReports(lat, lng) {
    // PLACEHOLDER: returns [] until the safety_briefs table + reporting flow ships.
    // When implemented, query: SELECT id, type, body, lat, lng, created_at FROM safety_briefs
    // WHERE created_at > NOW() - INTERVAL '7 days'
    //   AND earth_box(ll_to_earth($lat,$lng), 5000) @> ll_to_earth(lat,lng)
    // ORDER BY created_at DESC LIMIT 5
    return [];
}

async function fetchCrimeAdapter(lat, lng) {
    // PLACEHOLDER for paid-data crime adapter. When SPOTCRIME_API_KEY (or similar)
    // is set, a future commit wires this to the configured provider and returns
    // real robbery/theft/assault reports as briefs. Until then we honestly return
    // nothing rather than fabricate stats.
    if (!process.env.SPOTCRIME_API_KEY && !process.env.CRIMEOMETER_API_KEY) return [];
    // Stub: real adapter to be plugged in. Returning empty keeps tone honest.
    return [];
}

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const url = new URL(req.url, 'http://x');
    const lat = parseFloat(url.searchParams.get('lat'));
    const lng = parseFloat(url.searchParams.get('lng'));
    const localHour = parseInt(url.searchParams.get('local_hour'), 10);

    if (isNaN(lat) || isNaN(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return res.status(400).json({ error: 'lat and lng query params are required (valid floats)' });
    }

    const key = bucket(lat) + ',' + bucket(lng) + ',' + (isNaN(localHour) ? '-' : localHour);
    const cached = CACHE.get(key);
    if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) {
        return res.status(200).json({ briefs: cached.briefs, cached: true });
    }

    try {
        const [nws, community, crime] = await Promise.all([
            fetchNWSAlerts(lat, lng),
            fetchCommunityReports(lat, lng),
            fetchCrimeAdapter(lat, lng),
        ]);
        const tod = timeOfDayBrief(localHour);
        const briefs = []
            .concat(crime)               // most actionable first
            .concat(community)
            .concat(nws)
            .concat(tod ? [tod] : []);

        CACHE.set(key, { at: Date.now(), briefs: briefs });
        return res.status(200).json({ briefs: briefs });
    } catch (err) {
        console.error('[ai/briefs]', err);
        return res.status(500).json({ error: 'Failed to assemble briefs' });
    }
};
