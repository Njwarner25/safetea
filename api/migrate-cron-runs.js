const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret || req.headers['x-migrate-secret'];
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS cron_runs (
        id BIGSERIAL PRIMARY KEY,
        cron_name VARCHAR(100) NOT NULL,
        started_at TIMESTAMPTZ NOT NULL,
        duration_ms INTEGER,
        status VARCHAR(20) NOT NULL,
        http_status INTEGER,
        error_message TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    results.push('Ensured cron_runs table');
  } catch (e) { results.push('cron_runs table: ' + e.message); }

  try {
    await run(`CREATE INDEX IF NOT EXISTS idx_cron_runs_name_started ON cron_runs (cron_name, started_at DESC)`);
    results.push('Ensured idx_cron_runs_name_started');
  } catch (e) { results.push('idx_cron_runs_name_started: ' + e.message); }

  try {
    await run(`CREATE INDEX IF NOT EXISTS idx_cron_runs_failures ON cron_runs (started_at DESC) WHERE status <> 'success'`);
    results.push('Ensured idx_cron_runs_failures');
  } catch (e) { results.push('idx_cron_runs_failures: ' + e.message); }

  return res.status(200).json({ success: true, results });
};
