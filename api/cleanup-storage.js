const { run, getOne } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Require MIGRATE_SECRET for safety
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = [];

  try {
    // 1. Delete old recording chunks (> 30 days)
    try {
      const r = await run("DELETE FROM recording_chunks WHERE created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'recording_chunks', action: 'deleted old chunks (30+ days)' });
    } catch (e) { results.push({ table: 'recording_chunks', error: e.message }); }

    // 2. Delete resolved recording sessions (> 30 days)
    try {
      await run("DELETE FROM recording_sessions WHERE resolved_at IS NOT NULL AND created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'recording_sessions', action: 'deleted old resolved sessions' });
    } catch (e) { results.push({ table: 'recording_sessions', error: e.message }); }

    // 3. Clear expired photo image_data (force cleanup)
    try {
      await run("UPDATE photos SET image_data = NULL WHERE image_data IS NOT NULL AND (photo_status = 'expired' OR created_at < NOW() - INTERVAL '10 days')");
      results.push({ table: 'photos', action: 'cleared expired image_data' });
    } catch (e) { results.push({ table: 'photos', error: e.message }); }

    // 4. Delete old moderation logs (> 90 days)
    try {
      await run("DELETE FROM moderation_logs WHERE created_at < NOW() - INTERVAL '90 days'");
      results.push({ table: 'moderation_logs', action: 'deleted old logs (90+ days)' });
    } catch (e) { results.push({ table: 'moderation_logs', error: e.message }); }

    // 5. Delete old photo verification reports (> 60 days)
    try {
      await run("DELETE FROM photo_verification_reports WHERE created_at < NOW() - INTERVAL '60 days'");
      results.push({ table: 'photo_verification_reports', action: 'deleted old reports (60+ days)' });
    } catch (e) { results.push({ table: 'photo_verification_reports', error: e.message }); }

    // 6. Delete soft-deleted room posts and their data (> 60 days)
    try {
      await run("DELETE FROM room_replies WHERE room_post_id IN (SELECT id FROM room_posts WHERE hidden = true AND created_at < NOW() - INTERVAL '60 days')");
      await run("DELETE FROM room_post_likes WHERE room_post_id IN (SELECT id FROM room_posts WHERE hidden = true AND created_at < NOW() - INTERVAL '60 days')");
      await run("DELETE FROM room_posts WHERE hidden = true AND created_at < NOW() - INTERVAL '60 days'");
      results.push({ table: 'room_posts', action: 'deleted old hidden room posts (60+ days)' });
    } catch (e) { results.push({ table: 'room_posts', error: e.message }); }

    // 7. Clear image_data from old room posts
    try {
      await run("UPDATE room_posts SET image_data = NULL WHERE image_data IS NOT NULL AND created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'room_posts.image_data', action: 'cleared old image_data (30+ days)' });
    } catch (e) { results.push({ table: 'room_posts.image_data', error: e.message }); }

    // 8. Delete old violations (> 90 days, keep recent for appeals)
    try {
      await run("DELETE FROM violations WHERE created_at < NOW() - INTERVAL '90 days'");
      results.push({ table: 'violations', action: 'deleted old violations (90+ days)' });
    } catch (e) { results.push({ table: 'violations', error: e.message }); }

    // 9. VACUUM to reclaim space
    try {
      await run('VACUUM');
      results.push({ action: 'VACUUM completed' });
    } catch (e) { results.push({ action: 'VACUUM', error: e.message }); }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: 'Cleanup failed', details: err.message, results });
  }
};
