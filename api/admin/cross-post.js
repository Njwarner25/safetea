/**
 * POST /api/admin/cross-post — queue a cross-platform post via Buffer.
 * GET  /api/admin/cross-post — list recent cross-post attempts (for the admin UI history).
 *
 * Admin-only. Records every attempt in social_posts so failures and successes
 * are auditable. If BUFFER_ACCESS_TOKEN isn't set, the request is recorded as
 * status='simulated' instead of being sent — useful for previewing the queue.
 */

const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const buffer = require('../../services/buffer-client');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (req.method === 'GET') {
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    try {
      const rows = await getMany(
        `SELECT id, caption, media_url, platforms, scheduled_for, status,
                error, created_at,
                (admin_user_id IS NOT NULL) AS has_user
         FROM social_posts
         ORDER BY created_at DESC
         LIMIT $1`,
        [limit]
      );
      return res.status(200).json({
        posts: rows,
        buffer_configured: buffer.isConfigured()
      });
    } catch (err) {
      console.error('[CrossPost] list failed:', err.message);
      return res.status(500).json({ error: 'List failed' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) { body = {}; }
  }
  body = body || {};

  const caption = (body.caption || '').toString().trim();
  const mediaUrl = body.mediaUrl ? body.mediaUrl.toString().trim() : null;
  const scheduledFor = body.scheduledFor ? new Date(body.scheduledFor) : null;
  const profileIds = Array.isArray(body.profileIds) ? body.profileIds : [];
  const platforms = Array.isArray(body.platforms) ? body.platforms.map(String) : [];

  if (!caption) {
    return res.status(400).json({ error: 'Caption is required' });
  }
  if (caption.length > 2200) {
    return res.status(400).json({ error: 'Caption too long (max 2200 chars to satisfy IG)' });
  }
  if (mediaUrl && !/^https?:\/\//.test(mediaUrl)) {
    return res.status(400).json({ error: 'Media URL must be absolute (https://...)' });
  }
  if (scheduledFor && (isNaN(scheduledFor) || scheduledFor.getTime() < Date.now() - 60000)) {
    return res.status(400).json({ error: 'scheduledFor must be a valid future timestamp' });
  }

  // Insert as 'pending' first; we'll update with the outcome in a moment.
  let insertedId = null;
  try {
    const inserted = await getOne(
      `INSERT INTO social_posts (admin_user_id, caption, media_url, platforms, scheduled_for, status)
       VALUES ($1, $2, $3, $4, $5, 'pending')
       RETURNING id`,
      [user.id, caption, mediaUrl, platforms, scheduledFor]
    );
    insertedId = inserted && inserted.id;
  } catch (err) {
    console.error('[CrossPost] insert failed:', err.message);
    return res.status(500).json({ error: 'Could not record post' });
  }

  // No Buffer token? Record as simulated and return — the admin UI shows it in the queue.
  if (!buffer.isConfigured()) {
    await run(
      `UPDATE social_posts SET status = 'simulated', buffer_response = $1 WHERE id = $2`,
      [JSON.stringify({ note: 'BUFFER_ACCESS_TOKEN not set; nothing was sent.' }), insertedId]
    );
    return res.status(200).json({
      id: insertedId,
      status: 'simulated',
      message: 'Recorded but not sent — set BUFFER_ACCESS_TOKEN in Vercel env to enable live posting.',
      docs: 'docs/SOCIAL_CROSS_POSTING_SETUP.md'
    });
  }

  if (!profileIds.length) {
    await run(`UPDATE social_posts SET status = 'failed', error = $1 WHERE id = $2`,
      ['No Buffer profile IDs supplied', insertedId]);
    return res.status(400).json({ error: 'profileIds required when Buffer is configured. Hit GET /api/admin/cross-post-profiles to fetch them.' });
  }

  const result = await buffer.schedulePost({
    profileIds,
    text: caption,
    mediaUrl,
    scheduledAt: scheduledFor ? scheduledFor.toISOString() : null
  });

  if (result.ok) {
    await run(
      `UPDATE social_posts SET status = 'queued', buffer_response = $1 WHERE id = $2`,
      [JSON.stringify(result.data || {}), insertedId]
    );
    return res.status(200).json({ id: insertedId, status: 'queued', buffer: result.data });
  }

  await run(
    `UPDATE social_posts SET status = 'failed', error = $1, buffer_response = $2 WHERE id = $3`,
    [result.error || 'Unknown error', JSON.stringify(result.data || {}), insertedId]
  );
  return res.status(502).json({ id: insertedId, status: 'failed', error: result.error });
};
