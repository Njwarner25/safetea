/**
 * POST   /api/area-alerts/safe-zone     — add one zone
 * DELETE /api/area-alerts/safe-zone?index=N — remove by array index
 *
 * POST body: { name, latitude, longitude, radius_meters? }
 *
 * Stored as an array in user_alert_preferences.safe_zones (JSONB).
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const MAX_ZONES = 20;

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

  try {
    const prefs = await loadOrCreate(user.id);
    let zones = Array.isArray(prefs.safe_zones) ? prefs.safe_zones.slice() : [];

    if (req.method === 'POST') {
      const body = (await parseBody(req)) || {};
      const lat = Number(body.latitude);
      const lng = Number(body.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
        return res.status(400).json({ error: 'latitude and longitude required (numeric)' });
      }
      if (Math.abs(lat) > 90 || Math.abs(lng) > 180) {
        return res.status(400).json({ error: 'lat/lng out of range' });
      }
      if (zones.length >= MAX_ZONES) {
        return res.status(400).json({ error: 'Safe-zone limit reached (' + MAX_ZONES + ')' });
      }
      const name = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';
      const radius = Number.isFinite(Number(body.radius_meters))
        ? Math.max(50, Math.min(2000, Number(body.radius_meters)))
        : 200;
      zones.push({
        name: name || 'Saved zone',
        latitude: lat,
        longitude: lng,
        radius_meters: radius,
      });
      await run(
        `UPDATE user_alert_preferences SET safe_zones = $1::jsonb, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(zones), user.id]
      );
      return res.status(200).json({ safe_zones: zones });
    }

    if (req.method === 'DELETE') {
      const idx = parseInt(req.query.index, 10);
      if (!Number.isInteger(idx) || idx < 0 || idx >= zones.length) {
        return res.status(400).json({ error: 'index out of range' });
      }
      zones.splice(idx, 1);
      await run(
        `UPDATE user_alert_preferences SET safe_zones = $1::jsonb, updated_at = NOW() WHERE user_id = $2`,
        [JSON.stringify(zones), user.id]
      );
      return res.status(200).json({ safe_zones: zones });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[area-alerts/safe-zone]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
