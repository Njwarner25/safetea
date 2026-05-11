/**
 * OpenStreetMap Overpass-based "what kind of place is this lat/lng?" lookup.
 *
 * Free, no API key. Returns a small bag of place-type flags Alessia uses to
 * select location-specific safety patterns:
 *
 *   {
 *     alley:    true|false,
 *     parking:  true|false,
 *     transit:  true|false,
 *     park:     true|false,
 *     nightlife:true|false,
 *     residential: true|false,
 *     primaryType: 'alley' | 'parking' | 'transit' | 'park' | 'nightlife' | 'street'
 *   }
 *
 * 30-day in-memory cache keyed by ~50m coord bucket — place type doesn't change
 * day-to-day, so cache aggressively to keep Overpass usage well under limits.
 */

'use strict';

const CACHE = new Map();
const CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const OVERPASS_URL = 'https://overpass-api.de/api/interpreter';
const UA = 'LinkHerSafeTea-Companion/1.0 (contact: njwarner25@gmail.com)';

function bucket(n) { return (Math.round(n * 2000) / 2000).toFixed(4); } // ~50m

function buildQuery(lat, lng) {
    // 80m radius scan; if any matching tag is present, the place flag turns on.
    // Highway service=alley, amenity=parking/parking_entrance, railway=station,
    // public_transport=stop_position, leisure=park, amenity=bar/nightclub.
    return `
        [out:json][timeout:15];
        (
          way(around:80,${lat},${lng})[highway=service][service=alley];
          way(around:80,${lat},${lng})[highway=footway];
          way(around:80,${lat},${lng})[amenity=parking];
          way(around:80,${lat},${lng})[amenity=parking_entrance];
          node(around:80,${lat},${lng})[amenity=parking];
          node(around:80,${lat},${lng})[railway=station];
          node(around:80,${lat},${lng})[public_transport=stop_position];
          node(around:80,${lat},${lng})[amenity=bus_station];
          way(around:80,${lat},${lng})[leisure=park];
          node(around:80,${lat},${lng})[amenity=bar];
          node(around:80,${lat},${lng})[amenity=nightclub];
          node(around:80,${lat},${lng})[amenity=pub];
          way(around:50,${lat},${lng})[landuse=residential];
        );
        out tags;
    `.trim();
}

function summarize(elements) {
    const flags = { alley:false, parking:false, transit:false, park:false, nightlife:false, residential:false };
    for (const el of elements) {
        const t = el.tags || {};
        if (t.highway === 'service' && t.service === 'alley') flags.alley = true;
        if (t.amenity === 'parking' || t.amenity === 'parking_entrance') flags.parking = true;
        if (t.railway === 'station' || t.public_transport === 'stop_position' || t.amenity === 'bus_station') flags.transit = true;
        if (t.leisure === 'park') flags.park = true;
        if (t.amenity === 'bar' || t.amenity === 'nightclub' || t.amenity === 'pub') flags.nightlife = true;
        if (t.landuse === 'residential') flags.residential = true;
    }
    // Pick a primary type for the pattern matcher to key off of.
    let primaryType = 'street';
    if (flags.alley) primaryType = 'alley';
    else if (flags.transit) primaryType = 'transit';
    else if (flags.parking) primaryType = 'parking';
    else if (flags.nightlife) primaryType = 'nightlife';
    else if (flags.park) primaryType = 'park';
    else if (flags.residential) primaryType = 'residential';
    return Object.assign(flags, { primaryType });
}

async function lookupPlaceType(lat, lng) {
    const key = bucket(lat) + ',' + bucket(lng);
    const cached = CACHE.get(key);
    if (cached && (Date.now() - cached.at) < CACHE_TTL_MS) return cached.flags;

    try {
        const body = 'data=' + encodeURIComponent(buildQuery(lat, lng));
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 7000);
        const res = await fetch(OVERPASS_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': UA },
            body: body,
            signal: ctrl.signal,
        });
        clearTimeout(t);
        if (!res.ok) {
            const empty = summarize([]);
            CACHE.set(key, { at: Date.now(), flags: empty });
            return empty;
        }
        const data = await res.json();
        const flags = summarize((data && data.elements) || []);
        CACHE.set(key, { at: Date.now(), flags: flags });
        return flags;
    } catch (e) {
        const empty = summarize([]);
        CACHE.set(key, { at: Date.now(), flags: empty });
        return empty;
    }
}

module.exports = { lookupPlaceType };
