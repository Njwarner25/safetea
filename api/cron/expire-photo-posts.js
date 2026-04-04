/**
 * Vercel Cron Job: Auto-hide photo posts older than 7 days
 *
 * Add to vercel.json "crons" array:
 * { "path": "/api/cron/expire-photo-posts", "schedule": "0 4 * * *" }
 *
 * Runs daily at 4 AM UTC.
 * Finds posts with image_url that are older than 7 days and hides them.
 */

const { getMany } = require('../_utils/db');
const { cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Auth: check x-cron-secret header. If CRON_SECRET is not set, allow (dev mode).
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const provided = req.headers['x-cron-secret'];
    if (provided !== cronSecret) {
      console.warn('Unauthorized cron request attempt to expire-photo-posts');
      return res.status(401).json({ error: 'Unauthorized' });
    }
  }

  try {
    const expired = await getMany(
      `UPDATE posts
       SET hidden = true
       WHERE image_url IS NOT NULL
         AND image_url != ''
         AND hidden = false
         AND created_at < NOW() - INTERVAL '7 days'
       RETURNING id`
    );

    const count = expired.length;
    console.log(`expire-photo-posts: ${count} photo post(s) hidden.`);

    return res.status(200).json({ success: true, expired: count });
  } catch (err) {
    console.error('expire-photo-posts: Error:', err);
    return res.status(500).json({ error: 'Cron job failed', message: err.message });
  }
};
