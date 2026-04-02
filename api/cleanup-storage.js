const { run, getOne, getMany } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!secret || secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const aggressive = req.query.aggressive === 'true';
  const results = [];

  try {
    // 1. Delete ALL recording chunks (these are huge — base64 audio)
    try {
      await run("DELETE FROM recording_chunks");
      results.push({ table: 'recording_chunks', action: 'deleted ALL chunks' });
    } catch (e) { results.push({ table: 'recording_chunks', error: e.message }); }

    // 2. Delete ALL recording sessions
    try {
      await run("DELETE FROM recording_sessions");
      results.push({ table: 'recording_sessions', action: 'deleted ALL sessions' });
    } catch (e) { results.push({ table: 'recording_sessions', error: e.message }); }

    // 3. Delete old crime_alerts (> 14 days)
    try {
      await run("DELETE FROM crime_alerts WHERE created_at < NOW() - INTERVAL '14 days'");
      results.push({ table: 'crime_alerts', action: 'deleted old alerts (14+ days)' });
    } catch (e) { results.push({ table: 'crime_alerts', error: e.message }); }

    // 4. Delete old photo_verification_reports
    try {
      await run("DELETE FROM photo_verification_reports WHERE created_at < NOW() - INTERVAL '7 days'");
      results.push({ table: 'photo_verification_reports', action: 'deleted old reports (7+ days)' });
    } catch (e) { results.push({ table: 'photo_verification_reports', error: e.message }); }

    // 5. Delete old redflag_scans (> 30 days)
    try {
      await run("DELETE FROM redflag_scans WHERE created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'redflag_scans', action: 'deleted old scans (30+ days)' });
    } catch (e) { results.push({ table: 'redflag_scans', error: e.message }); }

    // 6. Delete old catfish_scans (> 30 days)
    try {
      await run("DELETE FROM catfish_scans WHERE created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'catfish_scans', action: 'deleted old scans (30+ days)' });
    } catch (e) { results.push({ table: 'catfish_scans', error: e.message }); }

    // 7. Delete old sos_events (> 30 days)
    try {
      await run("DELETE FROM sos_events WHERE created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'sos_events', action: 'deleted old events (30+ days)' });
    } catch (e) { results.push({ table: 'sos_events', error: e.message }); }

    // 8. Delete old name_watch_matches (> 60 days)
    try {
      await run("DELETE FROM name_watch_matches WHERE created_at < NOW() - INTERVAL '60 days'");
      results.push({ table: 'name_watch_matches', action: 'deleted old matches (60+ days)' });
    } catch (e) { results.push({ table: 'name_watch_matches', error: e.message }); }

    // 9. Delete hidden posts and their related data (> 30 days)
    try {
      await run("DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE hidden = true AND created_at < NOW() - INTERVAL '30 days')");
      await run("DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE hidden = true AND created_at < NOW() - INTERVAL '30 days')");
      await run("DELETE FROM post_reports WHERE post_id IN (SELECT id FROM posts WHERE hidden = true AND created_at < NOW() - INTERVAL '30 days')");
      await run("DELETE FROM posts WHERE hidden = true AND created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'posts (hidden)', action: 'deleted old hidden posts + related data' });
    } catch (e) { results.push({ table: 'posts (hidden)', error: e.message }); }

    // 10. Delete old verification_attempts (> 30 days)
    try {
      await run("DELETE FROM verification_attempts WHERE created_at < NOW() - INTERVAL '30 days'");
      results.push({ table: 'verification_attempts', action: 'deleted old attempts (30+ days)' });
    } catch (e) { results.push({ table: 'verification_attempts', error: e.message }); }

    // 11. Check DB size
    try {
      const size = await getOne("SELECT pg_size_pretty(pg_database_size(current_database())) as db_size");
      results.push({ db_size: size.db_size });
    } catch (e) { results.push({ db_size_error: e.message }); }

    // 12. VACUUM to reclaim space
    try {
      await run('VACUUM');
      results.push({ action: 'VACUUM completed' });
    } catch (e) { results.push({ action: 'VACUUM', error: e.message }); }

    // 13. Check DB size after VACUUM
    try {
      const size = await getOne("SELECT pg_size_pretty(pg_database_size(current_database())) as db_size");
      results.push({ db_size_after_vacuum: size.db_size });
    } catch (e) { results.push({ db_size_after_error: e.message }); }

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: 'Cleanup failed', details: err.message, results });
  }
};
