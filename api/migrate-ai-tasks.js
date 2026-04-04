const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    await run(`CREATE TABLE IF NOT EXISTS ai_moderation_tasks (
      id SERIAL PRIMARY KEY,
      admin_id INTEGER REFERENCES users(id),
      name VARCHAR(200) NOT NULL,
      instruction TEXT NOT NULL,
      schedule_type VARCHAR(20) NOT NULL DEFAULT 'daily',
      schedule_interval INTEGER DEFAULT 24,
      scope VARCHAR(20) NOT NULL DEFAULT 'all',
      action_level VARCHAR(20) NOT NULL DEFAULT 'flag',
      active BOOLEAN DEFAULT true,
      last_run_at TIMESTAMPTZ,
      next_run_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    await run(`CREATE TABLE IF NOT EXISTS ai_task_runs (
      id SERIAL PRIMARY KEY,
      task_id INTEGER REFERENCES ai_moderation_tasks(id) ON DELETE CASCADE,
      posts_reviewed INTEGER DEFAULT 0,
      actions_taken JSONB DEFAULT '{}',
      summary TEXT,
      started_at TIMESTAMPTZ DEFAULT NOW(),
      completed_at TIMESTAMPTZ,
      error TEXT
    )`);

    await run(`CREATE INDEX IF NOT EXISTS idx_ai_tasks_active_next ON ai_moderation_tasks(active, next_run_at)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_ai_task_runs_task ON ai_task_runs(task_id, started_at DESC)`);

    return res.status(200).json({ success: true, message: 'AI moderation task tables created' });
  } catch (err) {
    console.error('AI tasks migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
