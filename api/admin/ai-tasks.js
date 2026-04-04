const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

function calculateNextRun(type, interval) {
  const now = new Date();
  switch (type) {
    case 'once': return new Date(now.getTime() + 60 * 1000);
    case 'hourly': return new Date(now.getTime() + (interval || 1) * 3600 * 1000);
    case 'daily': return new Date(now.getTime() + 24 * 3600 * 1000);
    case 'weekly': return new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    default: return new Date(now.getTime() + 24 * 3600 * 1000);
  }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    if (req.method === 'GET') {
      return await handleGet(req, res);
    } else if (req.method === 'POST') {
      return await handlePost(req, res, user);
    } else if (req.method === 'PUT') {
      return await handlePut(req, res);
    } else if (req.method === 'DELETE') {
      return await handleDelete(req, res);
    }
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('AI tasks error:', err);
    return res.status(500).json({ error: 'AI tasks operation failed: ' + err.message });
  }
};

async function handleGet(req, res) {
  const taskId = req.query?.task_id || (new URL(req.url, 'http://x').searchParams.get('task_id'));

  if (taskId) {
    const task = await getOne(
      `SELECT t.*, u.display_name as admin_name FROM ai_moderation_tasks t
       LEFT JOIN users u ON t.admin_id = u.id
       WHERE t.id = $1`,
      [taskId]
    );
    if (!task) return res.status(404).json({ error: 'Task not found' });

    const runs = await getMany(
      `SELECT id, posts_reviewed, actions_taken, summary, started_at, completed_at, error
       FROM ai_task_runs WHERE task_id = $1
       ORDER BY started_at DESC LIMIT 20`,
      [taskId]
    );

    return res.json({ task, runs });
  }

  // List all tasks with most recent run
  const tasks = await getMany(
    `SELECT t.*, u.display_name as admin_name,
       r.started_at as last_run_started, r.posts_reviewed as last_run_posts,
       r.actions_taken as last_run_actions, r.error as last_run_error
     FROM ai_moderation_tasks t
     LEFT JOIN users u ON t.admin_id = u.id
     LEFT JOIN LATERAL (
       SELECT started_at, posts_reviewed, actions_taken, error
       FROM ai_task_runs WHERE task_id = t.id
       ORDER BY started_at DESC LIMIT 1
     ) r ON true
     ORDER BY t.created_at DESC`
  );

  return res.json({ tasks });
}

async function handlePost(req, res, user) {
  const body = await parseBody(req);
  const { name, instruction, schedule_type, schedule_interval, scope, action_level } = body;

  if (!name || !name.trim()) return res.status(400).json({ error: 'name is required' });
  if (!instruction || !instruction.trim()) return res.status(400).json({ error: 'instruction is required' });

  const validSchedules = ['once', 'hourly', 'daily', 'weekly'];
  const validScopes = ['all', 'community', 'rooms'];
  const validActions = ['flag', 'warn', 'remove', 'auto'];

  const sType = validSchedules.includes(schedule_type) ? schedule_type : 'daily';
  const sScope = validScopes.includes(scope) ? scope : 'all';
  const sAction = validActions.includes(action_level) ? action_level : 'flag';
  const sInterval = parseInt(schedule_interval) || (sType === 'hourly' ? 1 : 24);

  const nextRun = calculateNextRun(sType, sInterval);

  const result = await getOne(
    `INSERT INTO ai_moderation_tasks (admin_id, name, instruction, schedule_type, schedule_interval, scope, action_level, next_run_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [user.id, name.trim(), instruction.trim(), sType, sInterval, sScope, sAction, nextRun]
  );

  return res.status(201).json({ task: result });
}

async function handlePut(req, res) {
  const body = await parseBody(req);
  const { id, name, instruction, schedule_type, schedule_interval, scope, action_level, active } = body;

  if (!id) return res.status(400).json({ error: 'id is required' });

  const existing = await getOne('SELECT * FROM ai_moderation_tasks WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  const updates = [];
  const values = [];
  let idx = 1;

  if (name !== undefined) { updates.push(`name = $${idx++}`); values.push(name.trim()); }
  if (instruction !== undefined) { updates.push(`instruction = $${idx++}`); values.push(instruction.trim()); }
  if (schedule_type !== undefined) { updates.push(`schedule_type = $${idx++}`); values.push(schedule_type); }
  if (schedule_interval !== undefined) { updates.push(`schedule_interval = $${idx++}`); values.push(parseInt(schedule_interval) || 1); }
  if (scope !== undefined) { updates.push(`scope = $${idx++}`); values.push(scope); }
  if (action_level !== undefined) { updates.push(`action_level = $${idx++}`); values.push(action_level); }

  if (active !== undefined) {
    updates.push(`active = $${idx++}`);
    values.push(!!active);
    // Recalculate next_run_at when re-enabling
    if (active && !existing.active) {
      const nextRun = calculateNextRun(schedule_type || existing.schedule_type, schedule_interval || existing.schedule_interval);
      updates.push(`next_run_at = $${idx++}`);
      values.push(nextRun);
    }
  }

  updates.push(`updated_at = $${idx++}`);
  values.push(new Date());
  values.push(id);

  const result = await getOne(
    `UPDATE ai_moderation_tasks SET ${updates.join(', ')} WHERE id = $${idx} RETURNING *`,
    values
  );

  return res.json({ task: result });
}

async function handleDelete(req, res) {
  const body = await parseBody(req);
  const id = body.id || (new URL(req.url, 'http://x').searchParams.get('id'));

  if (!id) return res.status(400).json({ error: 'id is required' });

  const existing = await getOne('SELECT id FROM ai_moderation_tasks WHERE id = $1', [id]);
  if (!existing) return res.status(404).json({ error: 'Task not found' });

  await run('DELETE FROM ai_moderation_tasks WHERE id = $1', [id]);

  return res.json({ success: true, message: 'Task deleted' });
}
