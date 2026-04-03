const { authenticate, cors } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { sendNameWatchMatchEmail } = require('../../services/email');
const { sendPushNotification } = require('../../services/push');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    var postBody = 'Has anyone dated Bradd Pitt? He gave me weird vibes on our last date and I want to know if anyone else has had a similar experience.';
    var city = user.city || 'Miami';

    // Insert test post (skip full name AI check — this is a test)
    var result = await getOne(
      `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
       VALUES ($1, $2, $3, $4, $5, 'community', NOW())
       RETURNING id`,
      [user.id, 'Has anyone dated Bradd Pitt?', postBody, 'general', city]
    );

    var postId = result.id;

    // Run name watch matching (same logic as post.js)
    var watchedNames = await getMany(
      `SELECT wn.id, wn.name, wn.user_id, u.email, u.display_name, u.city
       FROM watched_names wn
       JOIN users u ON u.id = wn.user_id
       WHERE u.subscription_tier != 'free'`
    );

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
        var existing = await getOne(
          'SELECT id FROM name_watch_matches WHERE watched_name_id = $1 AND post_id = $2',
          [wn.id, postId]
        );
        if (existing) continue;

        await run(
          'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
          [wn.id, postId, wn.name]
        );

        matches.push({ watchedName: wn.name, userId: wn.user_id, matchType: fullMatch ? 'full' : partMatch ? 'part' : 'initials' });

        // Send inbox system message
        var alertMsg = 'Name Watch Alert: "' + wn.name + '" was mentioned in a new post in ' + city + '. Check your Alerts tab.';
        run(
          'INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at) VALUES ($1, $1, $2, true, $3, NOW())',
          [wn.user_id, alertMsg, 'namewatch']
        ).catch(function() {});

        // Send push notification
        sendPushNotification(wn.user_id, 'Name Watch Alert', '"' + wn.name + '" was mentioned in a new post', { type: 'namewatch' }).catch(function() {});

        // Send email
        if (wn.email) {
          var snippet = postBody.length > 150 ? postBody.substring(0, 150) + '...' : postBody;
          sendNameWatchMatchEmail(wn.email, wn.display_name, wn.name, snippet, city).catch(function() {});
        }
      }
    }

    return res.status(201).json({
      success: true,
      postId: postId,
      postBody: postBody,
      watchedNamesChecked: watchedNames.length,
      matches: matches
    });
  } catch (err) {
    console.error('[Test] Name watch test error:', err);
    return res.status(500).json({ error: err.message });
  }
};
