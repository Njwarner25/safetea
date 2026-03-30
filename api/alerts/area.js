const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

const SAFETY_CATEGORY_MAP = {
  sexual_assault:    { label: 'Sexual Assault',    severity: 'high',   icon: '🚨' },
  assault:           { label: 'Assault',            severity: 'high',   icon: '⚠️' },
  domestic_violence: { label: 'Domestic Violence',  severity: 'high',   icon: '🚨' },
  stalking:          { label: 'Stalking',           severity: 'high',   icon: '🚨' },
  kidnapping:        { label: 'Kidnapping',         severity: 'high',   icon: '🚨' },
  human_trafficking: { label: 'Human Trafficking',  severity: 'high',   icon: '🚨' },
  harassment:        { label: 'Harassment',          severity: 'medium', icon: '⚠️' },
  robbery:           { label: 'Robbery',             severity: 'medium', icon: '⚠️' },
  indecent_exposure: { label: 'Indecent Exposure',   severity: 'medium', icon: '⚠️' },
};

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { lat, lon, radius, days, limit } = req.query;
  if (!lat || !lon) return res.status(400).json({ error: 'lat and lon required' });

  const radiusMiles = parseFloat(radius) || 0.5;
  const daysBack = Math.min(parseInt(days) || 30, 90);
  const maxResults = Math.min(parseInt(limit) || 50, 200);

  try {
    const alerts = await getMany(
      `SELECT *, (3959 * acos(
          cos(radians($1)) * cos(radians(latitude)) *
          cos(radians(longitude) - radians($2)) +
          sin(radians($1)) * sin(radians(latitude))
        )) AS distance_miles
       FROM crime_alerts
       WHERE occurred_at > NOW() - INTERVAL '${daysBack} days'
         AND latitude BETWEEN $1 - ($3 / 69.0) AND $1 + ($3 / 69.0)
         AND longitude BETWEEN $2 - ($3 / (69.0 * cos(radians($1)))) AND $2 + ($3 / (69.0 * cos(radians($1))))
       ORDER BY occurred_at DESC
       LIMIT $4`,
      [parseFloat(lat), parseFloat(lon), radiusMiles, maxResults]
    );

    // Filter by actual haversine distance (bounding box is an approximation)
    const filtered = alerts.filter(a => parseFloat(a.distance_miles) <= radiusMiles);

    // Build summary by type
    const summary = {};
    filtered.forEach(row => {
      const type = row.crime_type;
      if (!summary[type]) {
        const info = SAFETY_CATEGORY_MAP[type] || { label: type, severity: 'medium', icon: '⚠️' };
        summary[type] = { ...info, count: 0, most_recent: null };
      }
      summary[type].count++;
      if (!summary[type].most_recent || new Date(row.occurred_at) > new Date(summary[type].most_recent)) {
        summary[type].most_recent = row.occurred_at;
      }
    });

    return res.status(200).json({
      total: filtered.length,
      radius_miles: radiusMiles,
      days_back: daysBack,
      summary,
      alerts: filtered
    });
  } catch (err) {
    console.error('[Alerts] Area query failed:', err);
    return res.status(500).json({ error: 'Failed to fetch alerts', details: err.message });
  }
};
