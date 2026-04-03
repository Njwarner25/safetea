var db = require('../_utils/db');
var cors = require('../_utils/auth').cors;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = 'init';
  try {
    // Find user who watches "Bradd Pitt"
    step = 'find_watcher';
    var watcher = await db.getOne(
      `SELECT wn.id AS wn_id, wn.name, wn.user_id, u.email, u.display_name, u.city
       FROM watched_names wn
       JOIN users u ON u.id = wn.user_id
       WHERE LOWER(wn.name) LIKE '%bradd%' OR LOWER(wn.name) LIKE '%pitt%'
       LIMIT 1`
    );

    if (!watcher) {
      return res.status(200).json({ error: 'No watched name matching bradd/pitt found', step: step });
    }

    // Create a test post as that user
    step = 'create_post';
    var postBody = 'Has anyone dated Bradd Pitt? He gave me weird vibes on our last date and I want to know if anyone else has had a similar experience.';
    var city = watcher.city || 'Miami';

    var post = await db.getOne(
      `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
       VALUES ($1, $2, $3, $4, $5, 'community', NOW())
       RETURNING id`,
      [watcher.user_id, 'Has anyone dated Bradd Pitt?', postBody, 'general', city]
    );

    // Run name watch matching
    step = 'fetch_watched';
    var watchedNames = await db.getMany(
      `SELECT wn.id, wn.name, wn.user_id, u.email, u.display_name, u.city
       FROM watched_names wn
       JOIN users u ON u.id = wn.user_id
       WHERE u.subscription_tier != 'free'`
    );

    step = 'match_names';
    var matches = [];
    var bodyLower = postBody.toLowerCase();

    for (var i = 0; i < watchedNames.length; i++) {
      var wn = watchedNames[i];
      var nameLower = wn.name.toLowerCase();
      var nameParts = nameLower.split(/\s+/);

      var fullMatch = bodyLower.includes(nameLower);
      var partMatch = nameParts.some(function(p) { return p.length >= 2 && bodyLower.includes(p); });

      if (fullMatch || partMatch) {
        step = 'insert_match_' + i;
        try {
          await db.run(
            'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
            [wn.id, post.id, wn.name]
          );
        } catch (e) {
          matches.push({ name: wn.name, error: e.message });
          continue;
        }

        matches.push({ name: wn.name, userId: wn.user_id, type: fullMatch ? 'full' : 'part' });

        // Send inbox alert
        step = 'inbox_' + i;
        var alertMsg = 'Name Watch Alert: "' + wn.name + '" was mentioned in a new post in ' + city + '. Check your Alerts tab.';
        try {
          await db.run(
            'INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at) VALUES ($1, $1, $2, true, $3, NOW())',
            [wn.user_id, alertMsg, 'namewatch']
          );
        } catch (e) {}

        // Send email
        step = 'email_' + i;
        if (wn.email) {
          try {
            var emailSvc = require('../../services/email');
            await emailSvc.sendNameWatchMatchEmail(wn.email, wn.display_name, wn.name, postBody.substring(0, 150), city);
          } catch (e) {}
        }
      }
    }

    return res.status(200).json({
      success: true,
      postId: post.id,
      city: city,
      watcherFound: watcher.display_name,
      watchedName: watcher.name,
      totalWatchedNames: watchedNames.length,
      matches: matches
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, step: step, code: err.code || null });
  }
};
