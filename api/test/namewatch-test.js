var auth = require('../_utils/auth');
var db = require('../_utils/db');

module.exports = async function handler(req, res) {
  auth.cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  var step = 'auth';
  try {
    var user = await auth.authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    step = 'insert_post';
    var postBody = 'Has anyone dated Bradd Pitt? He gave me weird vibes on our last date and I want to know if anyone else has had a similar experience.';
    var city = user.city || 'Miami';

    var result = await db.getOne(
      `INSERT INTO posts (user_id, title, body, category, city, feed, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, 'community', NULL, NOW())
       RETURNING id`,
      [user.id, 'Has anyone dated Bradd Pitt?', postBody, 'general', city]
    );
    var postId = result.id;

    step = 'fetch_watched_names';
    var watchedNames = [];
    try {
      watchedNames = await db.getMany(
        `SELECT wn.id, wn.name, wn.user_id, u.email, u.display_name, u.city
         FROM watched_names wn
         JOIN users u ON u.id = wn.user_id
         WHERE u.subscription_tier != 'free'`
      );
    } catch (e) {
      return res.status(201).json({ success: true, postId: postId, warning: 'watched_names query failed: ' + e.message, watchedNames: 0, matches: [] });
    }

    step = 'match_names';
    var matches = [];
    var bodyLower = postBody.toLowerCase();

    for (var i = 0; i < watchedNames.length; i++) {
      var wn = watchedNames[i];
      var nameLower = wn.name.toLowerCase();
      var nameParts = nameLower.split(/\s+/);

      var fullMatch = bodyLower.includes(nameLower);
      var partMatch = nameParts.some(function(p) { return p.length >= 2 && bodyLower.includes(p); });
      var initials = nameParts.map(function(p) { return p[0]; }).join('').toLowerCase();
      var initialMatch = initials.length >= 2 && bodyLower.includes(initials);

      if (fullMatch || partMatch || initialMatch) {
        // Insert match record
        try {
          var existing = await db.getOne(
            'SELECT id FROM name_watch_matches WHERE watched_name_id = $1 AND post_id = $2',
            [wn.id, postId]
          );
          if (!existing) {
            await db.run(
              'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
              [wn.id, postId, wn.name]
            );
          }
        } catch (e) {
          matches.push({ watchedName: wn.name, userId: wn.user_id, error: 'match insert: ' + e.message });
          continue;
        }

        matches.push({ watchedName: wn.name, userId: wn.user_id, matchType: fullMatch ? 'full' : partMatch ? 'part' : 'initials' });

        // Inbox message (non-blocking)
        var alertMsg = 'Name Watch Alert: "' + wn.name + '" was mentioned in a new post in ' + city + '. Check your Alerts tab.';
        db.run(
          'INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at) VALUES ($1, $1, $2, true, $3, NOW())',
          [wn.user_id, alertMsg, 'namewatch']
        ).catch(function() {});

        // Email (non-blocking)
        if (wn.email) {
          try {
            var email = require('../../services/email');
            var snippet = postBody.length > 150 ? postBody.substring(0, 150) + '...' : postBody;
            email.sendNameWatchMatchEmail(wn.email, wn.display_name, wn.name, snippet, city).catch(function() {});
          } catch (e) {}
        }
      }
    }

    return res.status(201).json({
      success: true,
      postId: postId,
      city: city,
      watchedNamesChecked: watchedNames.length,
      matches: matches
    });
  } catch (err) {
    console.error('[Test] Failed at step:', step, err);
    return res.status(500).json({ error: err.message, step: step });
  }
};
