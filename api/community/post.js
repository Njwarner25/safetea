const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { checkForFullNames } = require('../_utils/check-fullname');
const { enforceCityChatAccess } = require('../_utils/gender-gate');
const { sendNameWatchMatchEmail } = require('../../services/email');
const { sendPushNotification } = require('../../services/push');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Trust score gate: require score >= 70 to post in city chat
  if ((user.trust_score || 0) < 70) {
    return res.status(403).json({
      error: 'trust_score_too_low',
      required: 70,
      message: 'Complete verification steps to unlock city chat. Verify your identity and link social media accounts to get access.'
    });
  }

  // Gender gate: city chat is a women-only space
  if (await enforceCityChatAccess(user, res)) return;

  const body = await parseBody(req);
  const { title, body: postBody, category, city, image } = body;

  if (!postBody || postBody.trim().length < 3) {
    return res.status(400).json({ error: 'Post body is required (min 3 characters)' });
  }

  // Full name detection — block posts containing full first+last names
  try {
    const nameCheck = await checkForFullNames(postBody);
    if (nameCheck.fullNameDetected) {
      // Log the block for moderation reports
      run(
        `INSERT INTO moderation_logs (user_id, action, reason, category, details, created_at)
         VALUES ($1, 'full_name_blocked', $2, 'privacy', $3, NOW())`,
        [user.id, 'Post blocked: full name detected', JSON.stringify({ names: nameCheck.detectedNames })]
      ).catch(function(err) { console.error('[NameBlock] Log failed:', err.message); });

      return res.status(400).json({
        error: 'full_name_detected',
        type: 'full_name_detected',
        names: nameCheck.detectedNames,
        suggestion: nameCheck.suggestion,
        message: 'Your post contains a full name. Use first name + last initial instead.'
      });
    }
  } catch (nameErr) {
    console.error('[NameBlock] Check failed, allowing post:', nameErr.message);
  }

  try {
    const postTitle = title || postBody.substring(0, 80);
    const imageUrl = image || null;
    const result = await getOne(
      `INSERT INTO posts (user_id, title, body, category, city, feed, image_url, created_at)
       VALUES ($1, $2, $3, $4, $5, 'community', $6, NOW())
       RETURNING id`,
      [user.id, postTitle, postBody.trim(), category || 'general', city || user.city || null, imageUrl]
    );

    // Check Name Watch matches (non-blocking)
    checkNameWatchMatches(result.id, postBody, city || user.city).catch(function(err) {
      console.error('[NameWatch] Match check failed:', err.message);
    });

    return res.status(201).json({ id: result.id, message: 'Post created' });
  } catch (err) {
    console.error('[Community] Post creation failed:', err);
    return res.status(500).json({ error: 'Failed to create post', details: err.message });
  }
};

// ─── Name Watch Match Detection ───
async function checkNameWatchMatches(postId, postBody, postCity) {
  try {
    const watchedNames = await getMany(
      `SELECT wn.id, wn.name, wn.user_id, u.email, u.display_name, u.city
       FROM watched_names wn
       JOIN users u ON u.id = wn.user_id
       WHERE u.subscription_tier != 'free'`
    );

    if (!watchedNames || watchedNames.length === 0) return;

    const bodyLower = (postBody || '').toLowerCase();
    let matchCount = 0;

    for (const wn of watchedNames) {
      const nameLower = wn.name.toLowerCase();
      const nameParts = nameLower.split(/\s+/);

      const fullMatch = bodyLower.includes(nameLower);
      const partMatch = nameParts.some(function(p) { return p.length >= 2 && bodyLower.includes(p); });
      const initials = nameParts.map(function(p) { return p[0]; }).join('').toLowerCase();
      const initialMatch = initials.length >= 2 && bodyLower.includes(initials);

      if (fullMatch || partMatch || initialMatch) {
        const existing = await getOne(
          'SELECT id FROM name_watch_matches WHERE watched_name_id = $1 AND post_id = $2',
          [wn.id, postId]
        );
        if (existing) continue;

        await run(
          'INSERT INTO name_watch_matches (watched_name_id, post_id, matched_name) VALUES ($1, $2, $3)',
          [wn.id, postId, wn.name]
        );
        matchCount++;

        // Send inbox system message
        var alertMsg = 'Name Watch Alert: "' + wn.name + '" was mentioned in a new post in ' + (postCity || 'your area') + '. Check your Alerts tab.';
        run(
          'INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at) VALUES ($1, $1, $2, true, $3, NOW())',
          [wn.user_id, alertMsg, 'namewatch']
        ).catch(function(err) { console.error('[NameWatch] Inbox message failed:', err.message); });

        // Send push notification
        sendPushNotification(wn.user_id, 'Name Watch Alert', '"' + wn.name + '" was mentioned in a new post', { type: 'namewatch' }).catch(function() {});

        if (wn.email) {
          const snippet = postBody.length > 150 ? postBody.substring(0, 150) + '...' : postBody;
          sendNameWatchMatchEmail(wn.email, wn.display_name, wn.name, snippet, postCity || wn.city).catch(function(err) {
            console.error('[NameWatch] Email failed for', wn.email, err.message);
          });
        }
      }
    }

    if (matchCount > 0) {
      console.log(`[NameWatch] ${matchCount} match(es) found for post ${postId}`);
    }
  } catch (err) {
    console.error('[NameWatch] Match check error:', err.message);
  }
}
