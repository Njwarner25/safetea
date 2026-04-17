const { fetchAllCities } = require('../../services/crimeDataFetcher');
const { authenticate } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

// Allow up to 120 seconds for fetching crime data from multiple city APIs
module.exports.config = { maxDuration: 120 };

async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Allow: Vercel cron secret OR authenticated admin user
  const cronSecret = req.headers['authorization'];
  let authorized = false;

  if (process.env.CRON_SECRET && cronSecret === `Bearer ${process.env.CRON_SECRET}`) {
    authorized = true;
  } else if (!process.env.CRON_SECRET) {
    authorized = true;
  } else {
    // Fall back to admin auth
    const user = await authenticate(req);
    if (user) {
      const row = await getOne('SELECT role FROM users WHERE id = $1', [user.id]);
      if (row && row.role === 'admin') authorized = true;
    }
  }

  if (!authorized) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    console.log('[CrimeAlerts] Cron job started...');
    const result = await fetchAllCities();
    console.log(`[CrimeAlerts] Cron job complete. ${result.total} records processed.`);
    return res.status(200).json({ success: true, records_processed: result.total, cities: result.cities });
  } catch (err) {
    console.error('[CrimeAlerts] Cron job failed:', err);
    return res.status(500).json({ error: 'Cron job failed', details: err.message });
  }
};

module.exports = require('../_utils/cron-wrapper').withCronLogging('fetch-crime-alerts', handler);
