const { fetchAllCities } = require('../../services/crimeDataFetcher');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  // Optional: verify cron secret to prevent public triggering
  const cronSecret = req.headers['authorization'];
  if (process.env.CRON_SECRET && cronSecret !== `Bearer ${process.env.CRON_SECRET}`) {
    // Allow in dev or if no secret is set
    if (process.env.CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    console.log('[CrimeAlerts] Cron job started...');
    const count = await fetchAllCities();
    console.log(`[CrimeAlerts] Cron job complete. ${count} records processed.`);
    return res.status(200).json({ success: true, records_processed: count });
  } catch (err) {
    console.error('[CrimeAlerts] Cron job failed:', err);
    return res.status(500).json({ error: 'Cron job failed', details: err.message });
  }
};
