/**
 * Vercel Cron Job: Auto-delete posts with photos after 7 days
 *
 * Add to vercel.json "crons" array:
 * { "path": "/api/cron/cleanup-photos", "schedule": "0 3 * * *" }
 *
 * This runs daily at 3 AM UTC.
 * Performs soft deletes on posts and associated photos.
 */

const { getMany, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  // SECURITY: Verify the cron request is coming from Vercel using CRON_SECRET
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  // Check Authorization header: Bearer <CRON_SECRET>
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (providedSecret !== cronSecret) {
    console.warn('Unauthorized cron request attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // Allow CORS for cron requests (optional, but follows pattern)
  cors(res, req);

  // Only allow GET requests for cron jobs
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use GET or POST.' });
  }

  try {
    // Get all posts with photos that are older than 7 days
    // Posts can include photos in their "context" field (JSONB array of photo objects)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const postsToDelete = await getMany(
      `SELECT id, user_id, context
       FROM posts
       WHERE is_deleted = false
       AND created_at < $1
       AND context IS NOT NULL
       AND jsonb_array_length(context) > 0`,
      [sevenDaysAgo.toISOString()]
    );

    let postsDeleted = 0;
    let photosDeleted = 0;

    // Process each post
    for (const post of postsToDelete) {
      try {
        // Soft delete the post
        await run(
          `UPDATE posts
           SET is_deleted = true, deleted_at = NOW()
           WHERE id = $1`,
          [post.id]
        );
        postsDeleted++;

        // Extract photo IDs from context and soft delete them
        if (post.context && Array.isArray(post.context)) {
          for (const item of post.context) {
            if (item.photo_id) {
              await run(
                `UPDATE photos
                 SET is_deleted = true, deleted_at = NOW()
                 WHERE id = $1`,
                [item.photo_id]
              );
              photosDeleted++;
            }
          }
        }
      } catch (err) {
        console.error(`Error deleting post ${post.id}:`, err);
        // Continue with next post instead of failing the entire job
      }
    }

    const message = `Cleanup completed: ${postsDeleted} posts and ${photosDeleted} photos soft-deleted`;
    console.log(message);

    return res.status(200).json({
      success: true,
      message,
      stats: {
        posts_deleted: postsDeleted,
        photos_deleted: photosDeleted,
        cutoff_date: sevenDaysAgo.toISOString(),
      },
    });
  } catch (err) {
    console.error('Photo cleanup cron job error:', err);
    return res.status(500).json({
      error: 'Failed to execute photo cleanup',
      details: err.message,
    });
  }
};
