/**
 * GET  /api/area-alerts/preferences — returns the caller's prefs (creates default row).
 * PUT  /api/area-alerts/preferences — updates toggles + sensitivity (+ safe_zones if provided).
 *
 * Body (PUT):
 *   {
 *     area_alerts_enabled?: boolean,
 *     crime_trend_alerts_enabled?: boolean,
 *     parking_alerts_enabled?: boolean,
 *     transit_alerts_enabled?: boolean,
 *     sensitivity?: 'low'|'standard'|'high',
 *     safe_zones?: [{ name, latitude, longitude, radius_meters? }, ...]
 *   }
 *
 * Only keys present in the body are updated.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const VALID_SENSITIVITY = new Set(['low', 'standard', 'high']);
const BOOL_FIELDS = [
  'area_alerts_enabled',
  'crime_trend_alerts_enabled',
  'parking_alerts_enabled',
  'transit_alerts_enabled',
];

function sanitizeZones(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (let i = 0; i < Math.min(raw.length, 20); i++) {
    const z = raw[i];
    if (!z || typeof z !== 'object') continue;
    const lat = Number(z.latitude);
    const lng = Number(z.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
    if (Math.abs(lat) > 90 || Math.abs(lng) > 180) continue;
    const name = typeof z.name === 'string' ? z.name.trim().slice(0, 80) : '';
    const radius = Number.isFinite(Number(z.radius_meters))
      ? Math.max(50, Math.min(2000, Number(z.radius_meters)))
      : 200;
    out.push({ name: name || 'Saved zone', latitude: lat, longitude: lng, radius_meters: radius });
  }
  return out;
}

async function loadOrCreate(userId) {
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

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  if (req.method === 'GET') {
    try {
      const row = await loadOrCreate(user.id);
      return res.status(200).json({ preferences: row });
    } catch (err) {
      console.error('[area-alerts/preferences GET]', err && err.message);
      return res.status(500).json({ error: err && err.message });
    }
  }

  if (req.method === 'PUT') {
    try {
      await loadOrCreate(user.id);
      const body = (await parseBody(req)) || {};

      const sets = [];
      const params = [user.id];
      let p = 1;

      for (const f of BOOL_FIELDS) {
        if (typeof body[f] === 'boolean') {
          p++;
          sets.push(f + ' = $' + p);
          params.push(body[f]);
        }
      }

      if (typeof body.sensitivity === 'string') {
        if (!VALID_SENSITIVITY.has(body.sensitivity)) {
          return res.status(400).json({ error: 'sensitivity must be low|standard|high' });
        }
        p++;
        sets.push('sensitivity = $' + p);
        params.push(body.sensitivity);
      }

      if (Array.isArray(body.safe_zones)) {
        const zones = sanitizeZones(body.safe_zones);
        if (zones === null) return res.status(400).json({ error: 'safe_zones must be an array of { name, latitude, longitude, radius_meters }' });
        p++;
        sets.push('safe_zones = $' + p + '::jsonb');
        params.push(JSON.stringify(zones));
      }

      if (!sets.length) {
        const row = await getOne('SELECT * FROM user_alert_preferences WHERE user_id = $1', [user.id]);
        return res.status(200).json({ preferences: row, note: 'no changes' });
      }

      sets.push('updated_at = NOW()');
      await run(
        'UPDATE user_alert_preferences SET ' + sets.join(', ') + ' WHERE user_id = $1',
        params
      );
      const row = await getOne('SELECT * FROM user_alert_preferences WHERE user_id = $1', [user.id]);
      return res.status(200).json({ preferences: row });
    } catch (err) {
      console.error('[area-alerts/preferences PUT]', err && err.message);
      return res.status(500).json({ error: err && err.message });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
