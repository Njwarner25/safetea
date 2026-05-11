/**
 * Crime-pattern intelligence for Alessia Safety Briefs.
 *
 * SOURCING:
 *   These patterns are sourced from publicly available federal aggregates —
 *   FBI National Incident-Based Reporting System (NIBRS) annual summaries,
 *   the BJS National Crime Victimization Survey (NCVS), and BJS supplemental
 *   reports on victim demographics. They are STATISTICAL TENDENCIES, not
 *   predictions of any individual event. The narrative wording follows the
 *   Alessia tone spec (calm, supportive, never "danger/unsafe/attack").
 *
 *   We treat patterns as slow-changing (year-over-year), so this static table
 *   is appropriate for a v1. A future commit can refresh from the FBI Crime
 *   Data Explorer (CDE) API per-state to get state-specific tilts on the
 *   same offense/place/time keys.
 *
 * KEY: offense × location_type × time_bucket × day_bucket → brief template
 *
 * USAGE:
 *   const briefs = matchPatterns(placeFlags, localHour, dayOfWeek);
 */

'use strict';

// Time buckets we key off of.
//   morning    05–11
//   midday     11–17
//   evening    17–21
//   night      21–02
//   late_night 02–05
function timeBucket(hour) {
    if (hour >= 5 && hour < 11) return 'morning';
    if (hour >= 11 && hour < 17) return 'midday';
    if (hour >= 17 && hour < 21) return 'evening';
    if (hour >= 21 || hour < 2) return 'night';
    return 'late_night';
}

function dayBucket(dow) {
    // 0 = Sun, 5 = Fri, 6 = Sat
    if (dow === 5 || dow === 6 || dow === 0) return 'weekend';
    return 'weekday';
}

/**
 * Each pattern entry: {
 *   id, offense, place, timeBuckets, dayBuckets, body, actions, severity, source
 * }
 *
 * The body MUST follow tone rules. Always cite the source ("FBI data",
 * "national crime statistics") so the user can verify and so the framing
 * stays informational rather than predictive.
 */
const PATTERNS = [
    // ---- ALLEYS ----
    {
        id: 'pat-alley-night',
        offense: 'robbery',
        place: 'alley',
        timeBuckets: ['evening', 'night', 'late_night'],
        dayBuckets: ['weekday', 'weekend'],
        body:
            "Alessia noticed you're near an alley. FBI data shows incidents in alley and isolated-walkway locations are more concentrated between 8 PM and 2 AM. If you can take a brighter, more populated route, you may want to — or start a Safe Walk so I'm with you.",
        actions: ['safe_walk', 'safer_route', 'share_location', 'dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS',
    },

    // ---- PARKING ----
    {
        id: 'pat-parking-dark',
        offense: 'theft_from_vehicle',
        place: 'parking',
        timeBuckets: ['evening', 'night', 'late_night'],
        dayBuckets: ['weekday', 'weekend'],
        body:
            "You're in or near a parking area. National crime statistics show vehicle break-ins are more common after dark, often when valuables are visible. Consider taking phones, bags, and electronics with you, and parking near lighting if you can.",
        actions: ['dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS',
    },

    // ---- TRANSIT ----
    {
        id: 'pat-transit-pm',
        offense: 'robbery',
        place: 'transit',
        timeBuckets: ['evening', 'night'],
        dayBuckets: ['weekday', 'weekend'],
        body:
            "You're near a transit stop or station. FBI data shows robbery reports at and around transit hubs concentrate between 5 PM and 9 PM. You may want to wait near other people or a station attendant, and stay aware while using your phone.",
        actions: ['share_location', 'check_in', 'dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS',
    },

    // ---- NIGHTLIFE ----
    {
        id: 'pat-nightlife-weekend',
        offense: 'aggravated_assault',
        place: 'nightlife',
        timeBuckets: ['night', 'late_night'],
        dayBuckets: ['weekend'],
        body:
            "Heading into a nightlife area on a weekend night. National data shows aggravated-assault reports near bars and entertainment districts peak between 11 PM and 2 AM, often correlated with alcohol. Stick with your group, agree on a meet-up spot, and keep drinks watched.",
        actions: ['share_location', 'check_in', 'dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS · BJS NCVS',
    },

    // ---- PARKS AT NIGHT ----
    {
        id: 'pat-park-night',
        offense: 'robbery',
        place: 'park',
        timeBuckets: ['night', 'late_night'],
        dayBuckets: ['weekday', 'weekend'],
        body:
            "You're near a park after dark. National statistics show parks and open green spaces see more reported incidents after closing hours. If your route allows, consider sticking to lit streets.",
        actions: ['safer_route', 'share_location', 'dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS',
    },

    // ---- RESIDENTIAL DAY (burglary pattern) ----
    {
        id: 'pat-residential-day',
        offense: 'burglary',
        place: 'residential',
        timeBuckets: ['midday'],
        dayBuckets: ['weekday'],
        body:
            "FBI data shows residential burglaries most often happen on weekdays between 10 AM and 3 PM — when homes are empty. If you're heading out, you may want to double-check doors, share your travel window, and trust a neighbor with a key.",
        actions: ['dismiss'],
        severity: 'gentle',
        source: 'FBI NIBRS',
    },

    // ---- GENERAL EVENING (any street) ----
    {
        id: 'pat-street-evening-women',
        offense: 'street_harassment',
        place: 'street',
        timeBuckets: ['evening', 'night'],
        dayBuckets: ['weekday', 'weekend'],
        body:
            "Walking alone in the evening. BJS data shows women are statistically more likely to be approached or harassed when walking alone after dark, especially in less-populated stretches. If your route gets quiet, you may want to share your live location or start a Safe Walk.",
        actions: ['safe_walk', 'share_location', 'dismiss'],
        severity: 'gentle',
        source: 'BJS NCVS',
    },
];

/**
 * Match patterns against the current context.
 *
 * @param {Object} flags     OSM place flags from services/safety/osm.js
 * @param {number} localHour 0–23
 * @param {number} dayOfWeek 0=Sun..6=Sat
 * @returns {Array} brief objects matching the /api/ai/briefs shape
 */
function matchPatterns(flags, localHour, dayOfWeek) {
    if (typeof localHour !== 'number' || isNaN(localHour)) return [];
    const tb = timeBucket(localHour);
    const db = dayBucket(typeof dayOfWeek === 'number' ? dayOfWeek : new Date().getDay());

    const out = [];
    const seenIds = new Set();

    for (const p of PATTERNS) {
        if (!p.timeBuckets.includes(tb)) continue;
        if (!p.dayBuckets.includes(db)) continue;

        // Match place: explicit flag must be true. The "street" pattern always
        // applies in the evening/night since it's the catch-all.
        const placeMatch =
            (p.place === 'alley' && flags.alley) ||
            (p.place === 'parking' && flags.parking) ||
            (p.place === 'transit' && flags.transit) ||
            (p.place === 'park' && flags.park) ||
            (p.place === 'nightlife' && flags.nightlife) ||
            (p.place === 'residential' && flags.residential) ||
            (p.place === 'street' && !flags.alley && !flags.transit && !flags.parking);

        if (!placeMatch) continue;
        if (seenIds.has(p.id)) continue;
        seenIds.add(p.id);

        out.push({
            id: p.id,
            type: 'PATTERN',
            icon: iconFor(p.place),
            body: p.body,
            severity: p.severity,
            actions: p.actions,
            source: p.source,
        });
    }

    // Cap to 2 pattern briefs per request so the surface stays calm, not a feed.
    return out.slice(0, 2);
}

function iconFor(place) {
    switch (place) {
        case 'alley': return 'fa-road-bridge';
        case 'parking': return 'fa-square-parking';
        case 'transit': return 'fa-train-subway';
        case 'park': return 'fa-tree';
        case 'nightlife': return 'fa-martini-glass';
        case 'residential': return 'fa-house';
        default: return 'fa-shield-halved';
    }
}

module.exports = { matchPatterns, timeBucket, dayBucket };
