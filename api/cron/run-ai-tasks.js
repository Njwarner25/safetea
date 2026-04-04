const { getMany, getOne, run } = require('../_utils/db');

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

function buildSystemPrompt(task) {
  return `You are SafeTea's AI content moderator for a women's dating safety platform. An admin has created a custom moderation task with these instructions:

ADMIN INSTRUCTION: "${task.instruction}"

Analyze the post below and respond ONLY with valid JSON:
{
  "flagged": true | false,
  "severity": "none" | "low" | "medium" | "high" | "critical",
  "recommendation": "approve" | "flag" | "warn" | "remove",
  "reasoning": "brief explanation"
}

Rules:
- Only flag content that matches the admin's instruction above
- severity: none=no match, low=borderline, medium=clear match, high=serious, critical=immediate action
- Be precise — don't over-flag. Only flag genuine matches to the instruction.`;
}

async function callClaude(systemPrompt, userMessage) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 512,
      system: systemPrompt,
      messages: [{ role: 'user', content: userMessage }]
    })
  });

  if (!response.ok) {
    const errData = await response.text();
    throw new Error('Claude API error: ' + response.status + ' ' + errData);
  }

  const result = await response.json();
  return result.content?.[0]?.text || '';
}

function calculateNextRun(type, interval) {
  const now = new Date();
  switch (type) {
    case 'once': return null;
    case 'hourly': return new Date(now.getTime() + (interval || 1) * 3600 * 1000);
    case 'daily': return new Date(now.getTime() + 24 * 3600 * 1000);
    case 'weekly': return new Date(now.getTime() + 7 * 24 * 3600 * 1000);
    default: return new Date(now.getTime() + 24 * 3600 * 1000);
  }
}

// Enforce action constrained by task's action_level
async function enforceAction(post, result, task, source) {
  const level = task.action_level;
  const rec = result.recommendation;
  const table = source === 'room_posts' ? 'room_posts' : 'posts';

  // Flag-only: can only flag, never warn/remove/ban
  if (level === 'flag') {
    if (rec === 'flag' || rec === 'warn' || rec === 'remove') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      return 'flagged';
    }
    return 'approved';
  }

  // Warn: can flag or warn, never remove
  if (level === 'warn') {
    if (rec === 'remove') {
      // Downgrade to warn
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `⚠️ AI Moderation: Your post was flagged.\n\nReason: ${result.reasoning}\n\nPlease follow community guidelines.`]
      );
      return 'warned';
    }
    if (rec === 'warn') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `⚠️ AI Moderation: Your post was flagged.\n\nReason: ${result.reasoning}\n\nPlease follow community guidelines.`]
      );
      return 'warned';
    }
    if (rec === 'flag') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      return 'flagged';
    }
    return 'approved';
  }

  // Remove: can flag, warn, or remove (but not ban)
  if (level === 'remove') {
    if (rec === 'remove') {
      if (source === 'room_posts') {
        await run('UPDATE room_posts SET deleted_by_ai = true, is_flagged = true WHERE id = $1', [post.id]);
      } else {
        await run('UPDATE posts SET hidden = true, is_flagged = true WHERE id = $1', [post.id]);
      }
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `🤖 Your post was removed by SafeTea's AI moderation.\n\nReason: ${result.reasoning}\n\nContact support@getsafetea.app if you believe this was a mistake.`]
      );
      return 'removed';
    }
    if (rec === 'warn') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `⚠️ AI Moderation: Your post was flagged.\n\nReason: ${result.reasoning}\n\nPlease follow community guidelines.`]
      );
      return 'warned';
    }
    if (rec === 'flag') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      return 'flagged';
    }
    return 'approved';
  }

  // Auto: full enforcement including ban for critical severity
  if (level === 'auto') {
    if (rec === 'remove' && result.severity === 'critical') {
      // Ban for critical
      if (source === 'room_posts') {
        await run('UPDATE room_posts SET deleted_by_ai = true, is_flagged = true WHERE id = $1', [post.id]);
      } else {
        await run('UPDATE posts SET hidden = true, is_flagged = true WHERE id = $1', [post.id]);
      }
      await run(
        `UPDATE users SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = 'permanent' WHERE id = $2`,
        ['AI task: ' + (result.reasoning || task.name), post.user_id]
      );
      return 'banned';
    }
    if (rec === 'remove') {
      if (source === 'room_posts') {
        await run('UPDATE room_posts SET deleted_by_ai = true, is_flagged = true WHERE id = $1', [post.id]);
      } else {
        await run('UPDATE posts SET hidden = true, is_flagged = true WHERE id = $1', [post.id]);
      }
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `🤖 Your post was removed by SafeTea's AI moderation.\n\nReason: ${result.reasoning}\n\nContact support@getsafetea.app if you believe this was a mistake.`]
      );
      return 'removed';
    }
    if (rec === 'warn') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      await run('UPDATE users SET warning_count = COALESCE(warning_count, 0) + 1, last_warned_at = NOW() WHERE id = $1', [post.user_id]);
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at) VALUES ($1, $1, $2, true, NOW())`,
        [post.user_id, `⚠️ AI Moderation: Your post was flagged.\n\nReason: ${result.reasoning}\n\nPlease follow community guidelines.`]
      );
      return 'warned';
    }
    if (rec === 'flag') {
      await run(`UPDATE ${table} SET is_flagged = true WHERE id = $1`, [post.id]);
      return 'flagged';
    }
    return 'approved';
  }

  return 'approved';
}

async function executeTask(task) {
  const runRecord = await getOne(
    `INSERT INTO ai_task_runs (task_id, started_at) VALUES ($1, NOW()) RETURNING id`,
    [task.id]
  );

  const actions = { approved: 0, flagged: 0, warned: 0, removed: 0, banned: 0, errors: 0 };
  let postsReviewed = 0;

  try {
    const systemPrompt = buildSystemPrompt(task);
    let posts = [];

    // Fetch posts by scope
    if (task.scope === 'community' || task.scope === 'all') {
      const communityPosts = await getMany(
        `SELECT id, body, category, city, user_id FROM posts
         WHERE hidden = false
         ORDER BY created_at DESC LIMIT 30`
      );
      posts = posts.concat(communityPosts.map(p => ({ ...p, _source: 'posts' })));
    }

    if (task.scope === 'rooms' || task.scope === 'all') {
      const roomPosts = await getMany(
        `SELECT id, body, type AS category, NULL AS city, author_id AS user_id FROM room_posts
         WHERE deleted_by_admin = false AND deleted_by_ai = false
         ORDER BY created_at DESC LIMIT 15`
      );
      posts = posts.concat(roomPosts.map(p => ({ ...p, _source: 'room_posts' })));
    }

    for (const post of posts) {
      try {
        const context = `Post content: "${(post.body || '').substring(0, 800)}"
Category: ${post.category || 'general'}
City: ${post.city || 'unknown'}`;

        const aiResponse = await callClaude(systemPrompt, context);

        let result;
        try {
          result = JSON.parse(aiResponse);
        } catch (e) {
          result = { flagged: false, severity: 'none', recommendation: 'approve', reasoning: aiResponse };
        }

        postsReviewed++;

        if (result.flagged && result.recommendation !== 'approve') {
          const action = await enforceAction(post, result, task, post._source);
          actions[action] = (actions[action] || 0) + 1;
        } else {
          actions.approved++;
        }

        // Rate limiting
        await new Promise(r => setTimeout(r, 300));
      } catch (postErr) {
        console.error(`AI task ${task.id} error on post ${post.id}:`, postErr.message);
        actions.errors++;
      }
    }

    const summary = `Reviewed ${postsReviewed} posts. Flagged: ${actions.flagged}, Warned: ${actions.warned}, Removed: ${actions.removed}, Banned: ${actions.banned}, Approved: ${actions.approved}, Errors: ${actions.errors}`;

    await run(
      `UPDATE ai_task_runs SET posts_reviewed = $1, actions_taken = $2, summary = $3, completed_at = NOW() WHERE id = $4`,
      [postsReviewed, JSON.stringify(actions), summary, runRecord.id]
    );

    // Update task: last_run_at and next_run_at
    const nextRun = calculateNextRun(task.schedule_type, task.schedule_interval);
    if (task.schedule_type === 'once') {
      await run(
        `UPDATE ai_moderation_tasks SET last_run_at = NOW(), active = false, next_run_at = NULL, updated_at = NOW() WHERE id = $1`,
        [task.id]
      );
    } else {
      await run(
        `UPDATE ai_moderation_tasks SET last_run_at = NOW(), next_run_at = $1, updated_at = NOW() WHERE id = $2`,
        [nextRun, task.id]
      );
    }

    return { task_id: task.id, run_id: runRecord.id, postsReviewed, actions, summary };
  } catch (err) {
    await run(
      `UPDATE ai_task_runs SET error = $1, completed_at = NOW() WHERE id = $2`,
      [err.message, runRecord.id]
    );
    return { task_id: task.id, run_id: runRecord.id, error: err.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-cron-secret'] || req.query.secret;
  const isAuthorized = secret === process.env.CRON_SECRET || secret === process.env.MIGRATE_SECRET;

  if (!isAuthorized) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (!ANTHROPIC_API_KEY) {
    return res.status(503).json({ error: 'ANTHROPIC_API_KEY not configured' });
  }

  try {
    const dueTasks = await getMany(
      `SELECT * FROM ai_moderation_tasks WHERE active = true AND next_run_at <= NOW() ORDER BY next_run_at ASC LIMIT 5`
    );

    if (!dueTasks || dueTasks.length === 0) {
      return res.json({ message: 'No tasks due', tasks_run: 0 });
    }

    const results = [];
    for (const task of dueTasks) {
      const result = await executeTask(task);
      results.push(result);
    }

    return res.json({
      message: `Ran ${results.length} AI moderation task(s)`,
      tasks_run: results.length,
      results
    });
  } catch (err) {
    console.error('AI tasks cron error:', err);
    return res.status(500).json({ error: 'AI tasks cron failed', details: err.message });
  }
};
