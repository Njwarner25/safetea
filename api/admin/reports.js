const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin' && user.role !== 'moderator') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const reports = await getMany(
      `SELECT id, week_label, report_text, raw_data, created_at
       FROM weekly_reports ORDER BY created_at DESC LIMIT 20`
    );

    return res.json({ reports: reports });
  } catch (err) {
    console.error('[AdminReports] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch reports', details: err.message });
  }
};
