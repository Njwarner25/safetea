/**
 * GET /api/area-alerts/check?lat=...&lng=...
 *
 * Returns an area alert for the authenticated user's current GPS,
 * or { alert: null, reason } if none. Respects cooldowns, safe
 * zones, and per-user toggles.
 *
 * Sources its incident data from the existing `crime_alerts` table,
 * which is cron-refreshed every 6 hours (see services/crimeDataFetcher.js).
 * That covers Chicago, New York, Los Angeles, Dallas, Atlanta,
 * Houston, Miami, Boston, and Philadelphia — so area alerts work in
 * every SafeTea-supported city.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

const RADIUS_M_BY_SENSITIVITY = { low: 300, standard: 500, high: 800 };
const SAFE_ZONE_RADIUS_M = 200;

const COOLDOWN_HIGH_MIN = 20;
const DAILY_LIMIT = 3;
const DEDUPE_HOURS = 4;

// Lookback windows per crime_type (days). Values aligned with the
// runbook's spec; tuned against the normalized types produced by
// services/crimeDataFetcher.js normalizeCrimeType().
const TIME_WINDOWS = {
  sexual_assault: 30,
  kidnapping: 30,
  human_trafficking: 30,
  robbery: 30,
  assault: 14,
  stalking: 30,
  harassment: 14,
  indecent_exposure: 14,
  // Domestic_violence rows in crime_alerts map to private-residence
  // incidents where area alerts would leak a victim's address. Filter
  // them out of the area-alert surface.
  domestic_violence: 0,
};

function haversineMeters(lat1, lng1, lat2, lng2) {
  const toRad = function (d) { return d * Math.PI / 180; };
  const R = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2))
    * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function scoreAlertLevel(incidents) {
  const byType = {};
  for (const i of incidents) byType[i.crime_type] = (byType[i.crime_type] || 0) + 1;
  const sexualAssault = byType.sexual_assault || 0;
  const kidnapping = byType.kidnapping || 0;
  const trafficking = byType.human_trafficking || 0;
  const robbery = byType.robbery || 0;
  const assault = byType.assault || 0;
  const stalking = byType.stalking || 0;
  const total = incidents.length;

  // RED — any single high-severity report OR a cluster of violent ones
  if (sexualAssault >= 1 || kidnapping >= 1 || trafficking >= 1) return 'red';
  if (robbery >= 5 || assault >= 5 || (robbery >= 2 && assault >= 2)) return 'red';

  // ORANGE — moderate clusters
  if (robbery >= 2 || assault >= 3 || stalking >= 2 || total >= 8) return 'orange';

  // YELLOW — general recent activity
  if (total >= 3) return 'yellow';

  return null;
}

const COPY = {
  sexual_assault: {
    title: 'Safety Alert Nearby',
    message: 'Area Alert: A serious safety incident was reported in this area recently. Stay alert, consider a different route, and reach out to a trusted contact.',
    recs: ['Consider a different route', 'Share your location with a trusted contact', 'Keep one earbud out'],
  },
  kidnapping: {
    title: 'Serious Incident Nearby',
    message: 'Area Alert: Recent serious incidents nearby. Stay alert, trust your instincts, and leave the area if something feels off.',
    recs: ['Share your location with a trusted contact', 'Trust your instincts', 'Move to a populated, well-lit area'],
  },
  human_trafficking: {
    title: 'Safety Alert Nearby',
    message: 'Area Alert: A serious safety incident was reported in this area recently. Stay alert, avoid isolated areas, and reach out to a trusted contact.',
    recs: ['Avoid isolated areas', 'Stay in groups when possible', 'Share your location with a trusted contact'],
  },
  robbery: {
    title: 'Robberies Reported Nearby',
    message: 'Area Alert: Several robberies were reported in this area. Stay aware, keep valuables hidden, and move with purpose.',
    recs: ['Keep valuables hidden', 'Stay aware of your surroundings', 'Move with purpose'],
  },
  assault: {
    title: 'Recent Incidents Nearby',
    message: 'Area Alert: Recent incidents nearby. Stay alert, trust your instincts, and leave the area if something feels off.',
    recs: ['Trust your instincts', 'Move to a well-lit, populated area', 'Consider sharing your location'],
  },
  stalking: {
    title: 'Safety Reports Nearby',
    message: 'SafeTea Alert: Recent safety reports nearby. Stay alert, vary your routes if you can, and consider sharing your location with a trusted contact.',
    recs: ['Vary your routes', 'Stay alert and aware', 'Share your location with a trusted contact'],
  },
  harassment: {
    title: 'Safety Reports Nearby',
    message: 'SafeTea Alert: Recent harassment reports nearby. Stay alert and trust your instincts.',
    recs: ['Trust your instincts', 'Stay aware of your surroundings', 'Consider a different route'],
  },
  indecent_exposure: {
    title: 'Safety Reports Nearby',
    message: 'SafeTea Alert: Recent reports nearby. Stay alert and trust your instincts.',
    recs: ['Trust your instincts', 'Stay in well-lit, populated areas', 'Move with purpose'],
  },
  general: {
    title: 'Recent Reports Nearby',
    message: 'SafeTea Alert: Recent incidents nearby. Stay alert, trust your instincts, and leave the area if something feels off.',
    recs: ['Stay aware of your surroundings', 'Trust your instincts', 'Consider sharing your location'],
  },
};

function topIncidentType(incidents) {
  const byType = {};
  for (const i of incidents) byType[i.crime_type] = (byType[i.crime_type] || 0) + 1;
  let top = 'general', topN = 0;
  for (const k of Object.keys(byType)) {
    if (byType[k] > topN) { top = k; topN = byType[k]; }
  }
  return { type: top, count: topN };
}

async function loadOrCreatePrefs(userId) {
  let row = await getOne('SELECT * FROM user_alert_preferences WHERE user_id = $1', [userId]);
  if (!row) {
    await run(
      `INSERT INTO user_alert_preferences (user_id) VALUES ($1) ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );
    row = await getOne('SELECT * FROM user_alert_preferences WHERE user_id = $1', [userId]);
  }
  return row;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const lat = parseFloat(req.query.lat);
  const lng = parseFloat(req.query.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return res.status(400).json({ error: 'lat and lng are required numeric query params' });
  }
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
    return res.status(400).json({ error: 'lat/lng out of range' });
  }

  try {
    const prefs = await loadOrCreatePrefs(user.id);
    if (!prefs.area_alerts_enabled) {
      return res.status(200).json({ alert: null, reason: 'disabled_by_user' });
    }

    const sensitivity = prefs.sensitivity || 'standard';
    const radius = RADIUS_M_BY_SENSITIVITY[sensitivity] || RADIUS_M_BY_SENSITIVITY.standard;

    // Safe zone check
    const safeZones = Array.isArray(prefs.safe_zones) ? prefs.safe_zones : [];
    for (const z of safeZones) {
      if (z && typeof z.latitude === 'number' && typeof z.longitude === 'number') {
        const r = Number(z.radius_meters) || SAFE_ZONE_RADIUS_M;
        if (haversineMeters(lat, lng, z.latitude, z.longitude) <= r) {
          return res.status(200).json({ alert: null, reason: 'safe_zone', zone: z.name || 'saved zone' });
        }
      }
    }

    // Cooldown: max 1 red/orange per 20 min
    const lastHigh = await getOne(
      `SELECT delivered_at FROM user_alert_history
       WHERE user_id = $1 AND alert_level IN ('red','orange')
       ORDER BY delivered_at DESC LIMIT 1`,
      [user.id]
    );
    if (lastHigh) {
      const ageMin = (Date.now() - new Date(lastHigh.delivered_at).getTime()) / 60000;
      if (ageMin < COOLDOWN_HIGH_MIN) {
        return res.status(200).json({ alert: null, reason: 'cooldown', minutes_remaining: Math.ceil(COOLDOWN_HIGH_MIN - ageMin) });
      }
    }

    // Daily cap
    const todayCount = await getOne(
      `SELECT COUNT(*)::int AS n FROM user_alert_history
       WHERE user_id = $1 AND delivered_at > (CURRENT_DATE)::timestamptz`,
      [user.id]
    );
    if (todayCount && todayCount.n >= DAILY_LIMIT) {
      let sosActive = false;
      try {
        const sos = await getOne(
          `SELECT id FROM date_checkouts WHERE user_id = $1 AND status IN ('active','checked_in','sos') LIMIT 1`,
          [user.id]
        );
        if (sos) sosActive = true;
      } catch (_) { /* table may not exist */ }
      if (!sosActive) {
        return res.status(200).json({ alert: null, reason: 'daily_limit' });
      }
    }

    // Bounding box + Haversine against crime_alerts
    const latDelta = radius / 111111;
    const lngDelta = radius / (111111 * Math.max(0.0001, Math.cos(lat * Math.PI / 180)));
    const maxWindowDays = Math.max(...Object.values(TIME_WINDOWS).filter(function (n) { return n > 0; }));

    const candidates = await getMany(
      `SELECT id, city, crime_type, latitude, longitude, occurred_at, severity
       FROM crime_alerts
       WHERE latitude BETWEEN $1 AND $2
         AND longitude BETWEEN $3 AND $4
         AND (occurred_at IS NULL OR occurred_at > NOW() - INTERVAL '1 day' * $5)
         AND crime_type <> 'domestic_violence'
         AND (crime_type IS NULL OR crime_type <> '')`,
      [lat - latDelta, lat + latDelta, lng - lngDelta, lng + lngDelta, maxWindowDays]
    );

    const incidents = [];
    for (const r of candidates) {
      if (!r.latitude || !r.longitude) continue;
      const window = TIME_WINDOWS[r.crime_type];
      if (window === 0) continue; // explicitly excluded (e.g. domestic_violence)
      const d = haversineMeters(lat, lng, Number(r.latitude), Number(r.longitude));
      if (d > radius) continue;
      if (r.occurred_at && window) {
        const ageDays = (Date.now() - new Date(r.occurred_at).getTime()) / (1000 * 60 * 60 * 24);
        if (ageDays > window) continue;
      }
      incidents.push({ id: r.id, crime_type: r.crime_type, distance: d });
    }

    const level = scoreAlertLevel(incidents);
    if (!level) {
      return res.status(200).json({ alert: null, reason: 'no_activity', incidents_in_window: incidents.length });
    }

    // Dedupe by top type
    const top = topIncidentType(incidents);
    const dupeRecent = await getOne(
      `SELECT id FROM user_alert_history
       WHERE user_id = $1 AND alert_type = $2
         AND delivered_at > NOW() - INTERVAL '1 hour' * $3
       LIMIT 1`,
      [user.id, top.type, DEDUPE_HOURS]
    );
    if (dupeRecent) {
      return res.status(200).json({ alert: null, reason: 'dedupe' });
    }

    const copy = COPY[top.type] || COPY.general;
    const incidentBreakdown = Object.entries(
      incidents.reduce(function (acc, i) { acc[i.crime_type] = (acc[i.crime_type] || 0) + 1; return acc; }, {})
    ).map(function (kv) { return { type: kv[0], count: kv[1] }; });

    const inserted = await getOne(
      `INSERT INTO user_alert_history
        (user_id, alert_type, alert_level, latitude, longitude, title, message)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [user.id, top.type, level, lat, lng, copy.title, copy.message]
    );

    return res.status(200).json({
      alert: {
        level: level,
        type: top.type,
        title: copy.title,
        message: copy.message,
        incident_count: incidents.length,
        time_window: (TIME_WINDOWS[top.type] || 14) + ' days',
        incidents: incidentBreakdown,
        recommendations: copy.recs,
        history_id: inserted ? String(inserted.id) : null,
      },
    });
  } catch (err) {
    console.error('[area-alerts/check]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
