/**
 * Vercel Cron Job: Expire photos after 10 days
 *
 * { "path": "/api/cron/cleanup-photos", "schedule": "0 3 * * *" }
 *
 * Runs daily at 3 AM UTC.
 * - Expires photos that have passed their expires_at date
 * - Deletes image_data (base64) from expired photos to free storage
 * - Updates parent posts with photo_status = 'expired'
 * - Also handles legacy posts with context-based photos (7-day fallback)
 */

const { getMany, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');

async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (providedSecret !== cronSecret) {
    console.warn('Unauthorized cron request attempt');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  cors(res, req);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    let photosExpired = 0;
    let postsUpdated = 0;
    let legacyPhotosDeleted = 0;

    // --- Method 1: Expire photos with expires_at timestamp ---
    const expiredPhotos = await getMany(
      `SELECT id, user_id, context_id
       FROM photos
       WHERE (status = 'active' OR status IS NULL)
       AND is_deleted = false
       AND expires_at IS NOT NULL
       AND expires_at <= NOW()`
    );

    for (const photo of expiredPhotos) {
      try {
        // Clear image data and mark as expired
        await run(
          `UPDATE photos
           SET image_data = NULL, status = 'expired', expired_at = NOW(), is_deleted = true, deleted_at = NOW()
           WHERE id = $1`,
          [photo.id]
        );
        photosExpired++;

        // Update parent post if linked via context_id
        if (photo.context_id) {
          await run(
            `UPDATE posts SET photo_status = 'expired' WHERE id = $1`,
            [photo.context_id]
          ).catch(() => {});
          postsUpdated++;
        }
      } catch (err) {
        console.error(`Error expiring photo ${photo.id}:`, err);
      }
    }

    // --- Method 2: Legacy fallback — soft-delete posts with photos older than 10 days ---
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const legacyPosts = await getMany(
      `SELECT id, user_id, context
       FROM posts
       WHERE hidden IS NOT TRUE
       AND created_at < $1
       AND image_url IS NOT NULL
       AND image_url != ''
       AND (photo_status IS NULL OR photo_status != 'expired')`,
      [tenDaysAgo.toISOString()]
    ).catch(() => []);

    for (const post of legacyPosts) {
      try {
        await run(
          `UPDATE posts SET photo_status = 'expired', image_url = NULL WHERE id = $1`,
          [post.id]
        );
        postsUpdated++;

        // Also expire associated photos from context
        if (post.context && Array.isArray(post.context)) {
          for (const item of post.context) {
            if (item.photo_id) {
              await run(
                `UPDATE photos SET image_data = NULL, status = 'expired', expired_at = NOW(), is_deleted = true, deleted_at = NOW() WHERE id = $1`,
                [item.photo_id]
              );
              legacyPhotosDeleted++;
            }
          }
        }
      } catch (err) {
        console.error(`Error processing legacy post ${post.id}:`, err);
      }
    }

    const message = `Cleanup: ${photosExpired} photos expired, ${postsUpdated} posts updated, ${legacyPhotosDeleted} legacy photos cleaned`;
    console.log(message);

    return res.status(200).json({
      success: true,
      message,
      stats: {
        photos_expired: photosExpired,
        posts_updated: postsUpdated,
        legacy_photos_deleted: legacyPhotosDeleted,
        cutoff_date: tenDaysAgo.toISOString(),
      },
    });
  } catch (err) {
    console.error('Photo cleanup cron job error:', err);
    return res.status(500).json({ error: 'Failed to execute photo cleanup', details: err.message });
  }
};

module.exports = require('../_utils/cron-wrapper').withCronLogging('cleanup-photos', handler);
