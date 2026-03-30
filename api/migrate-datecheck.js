const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    // Add transportation column if it doesn't exist
    await run(`ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS transportation VARCHAR(50)`);
    results.push('Added transportation column');

    // Add transport_details column if it doesn't exist
    await run(`ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS transport_details TEXT`);
    results.push('Added transport_details column');

    return res.status(200).json({
      success: true,
      message: 'Date check migration complete',
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Migration failed', details: err.message, results });
  }
};
