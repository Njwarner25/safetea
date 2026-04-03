var db = require('../_utils/db');
var cors = require('../_utils/auth').cors;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  var step = 'init';
  try {
    // First: discover actual column names in watched_names table
    step = 'discover_schema';
    var columns = await db.getMany(
      `SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'watched_names' ORDER BY ordinal_position`
    );
    var colNames = columns.map(function(c) { return c.column_name; });

    // Determine the name column (could be 'name' or 'display_name')
    var nameCol = colNames.indexOf('display_name') >= 0 ? 'display_name' : 'name';
    var hasSearchTerms = colNames.indexOf('search_terms') >= 0;

    // Find user who watches "Bradd Pitt"
    step = 'find_watcher';
    var watcher = await db.getOne(
      'SELECT wn.id AS wn_id, wn.' + nameCol + ' AS watched_name, wn.user_id, u.email, u.display_name, u.city' +
      ' FROM watched_names wn' +
      ' JOIN users u ON u.id::text = wn.user_id::text' +
      ' WHERE LOWER(wn.' + nameCol + ') LIKE $1 OR LOWER(wn.' + nameCol + ') LIKE $2' +
      ' LIMIT 1',
      ['%bradd%', '%pitt%']
    );

    if (!watcher) {
      return res.status(200).json({
        error: 'No watched name matching bradd/pitt found',
        schema: { columns: colNames, nameCol: nameCol },
        step: step
      });
    }

    // Create a test post
    step = 'create_post';
    var postBody = 'Has anyone dated Bradd Pitt? He gave me weird vibes on our last date and I want to know if anyone else has had a similar experience.';
    var city = watcher.city || 'Miami';

    var post = await db.getOne(
      `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
       VALUES ($1, $2, $3, $4, $5, 'community', NOW())
       RETURNING id`,
      [watcher.user_id, 'Has anyone dated Bradd Pitt?', postBody, 'general', city]
    );

    // Fetch all watched names for matching
    step = 'fetch_watched';
    var watchedNames = await db.getMany(
      'SELECT wn.id, wn.' + nameCol + ' AS name, wn.user_id, u.email, u.display_name AS user_display_name, u.city' +
      ' FROM watched_names wn' +
      ' JOIN users u ON u.id::text = wn.user_id::text' +
      ' WHERE u.subscription_tier != $1',
      ['free']
    );

    // Match names against post
    step = 'match_names';
    var matches = [];
    var bodyLower = postBody.toLowerCase();

    for (var i = 0; i < watchedNames.length; i++) {
      var wn = watchedNames[i];
      var nameLower = (wn.name || '').toLowerCase();
      var nameParts = nameLower.split(/\s+/);

      var fullMatch = bodyLower.includes(nameLower);
      var partMatch = nameParts.some(function(p) { return p.length >= 2 && bodyLower.includes(p); });
      var initials = nameParts.map(function(p) { return p[0]; }).join('').toLowerCase();
      var initialMatch = initials.length >= 2 && bodyLower.includes(initials);

      if (fullMatch || partMatch || initialMatch) {
        try {
          await db.run(
            'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
            [wn.id, post.id, wn.name]
          );
        } catch (e) {
          matches.push({ name: wn.name, error: e.message });
          continue;
        }

        matches.push({ name: wn.name, userId: wn.user_id, type: fullMatch ? 'full' : partMatch ? 'part' : 'initials' });

        // Inbox alert
        var alertMsg = 'Name Watch Alert: "' + wn.name + '" was mentioned in a new post in ' + city + '. Check your Alerts tab.';
        db.run(
          'INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at) VALUES ($1, $1, $2, true, $3, NOW())',
          [wn.user_id, alertMsg, 'namewatch']
        ).catch(function() {});

        // Email
        if (wn.email) {
          try {
            var emailSvc = require('../../services/email');
            emailSvc.sendNameWatchMatchEmail(wn.email, wn.user_display_name, wn.name, postBody.substring(0, 150), city).catch(function() {});
          } catch (e) {}
        }
      }
    }

    return res.status(200).json({
      success: true,
      postId: post.id,
      city: city,
      schema: { columns: colNames, nameCol: nameCol },
      watcherFound: watcher.display_name,
      watchedName: watcher.watched_name,
      totalWatchedNames: watchedNames.length,
      matches: matches
    });
  } catch (err) {
    return res.status(500).json({ error: err.message, step: step, code: err.code || null });
  }
};
