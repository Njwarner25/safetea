const { sql } = require('@vercel/postgres');
const { getOne, getMany, run } = require('./_utils/db');
const { authenticate } = require('./_utils/auth');

/**
 * Seed community feeds with realistic content.
 * Auth options:
 *   - POST /api/seed-community?secret=$MIGRATE_SECRET   (matching x-migrate-secret header also works)
 *   - POST /api/seed-community   with Authorization: Bearer <admin-user-jwt>
 *
 * Creates seed accounts per city and populates posts, replies, and likes
 * with backdated timestamps spread over 7 days.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: migrate-secret OR admin user JWT
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  const secretOk = secret && secret === process.env.MIGRATE_SECRET;
  if (!secretOk) {
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden — requires MIGRATE_SECRET or admin user auth' });
    }
  }

  const results = { accounts_deleted: 0, accounts_created: 0, posts_created: 0, replies_created: 0, likes_created: 0, errors: [] };

  try {
    // ─── CLEAN UP OLD SEED DATA ───
    const oldAccounts = await getMany("SELECT id FROM users WHERE email LIKE '%@seed.safetea.local'");
    for (const acct of oldAccounts) {
      // Clean up all FK references before deleting user
      await run('DELETE FROM post_likes WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM post_dislikes WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM post_bumps WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM post_reports WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM replies WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM trust_events WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM moderation_logs WHERE target_id = $1::text', [acct.id]).catch(function() {});
      await run('DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM name_watch_matches WHERE watched_name_id IN (SELECT id FROM watched_names WHERE user_id = $1)', [acct.id]).catch(function() {});
      await run('DELETE FROM watched_names WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM connected_accounts WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM room_memberships WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM room_posts WHERE author_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM posts WHERE user_id = $1', [acct.id]).catch(function() {});
      await run('DELETE FROM users WHERE id = $1', [acct.id]);
      results.accounts_deleted++;
    }

    // ─── SEED ACCOUNTS (first name + last initial format) ───
    const ACCOUNTS = [
      { name: 'Ashley M.', color: '#E8A0B5' },
      { name: 'Brianna T.', color: '#A0C4E8' },
      { name: 'Chloe R.', color: '#C4E8A0' },
      { name: 'Destiny K.', color: '#E8C4A0' },
      { name: 'Elise W.', color: '#C4A0E8' },
      { name: 'Faith J.', color: '#A0E8C4' },
      { name: 'Grace L.', color: '#E8A0C4' },
      { name: 'Harper S.', color: '#A0E8E8' },
      { name: 'Imani D.', color: '#D4A0E8' },
      { name: 'Jordan P.', color: '#E8D4A0' },
      { name: 'Kayla N.', color: '#A0D4E8' },
      { name: 'Luna V.', color: '#E8A0D4' }
    ];

    // ─── SAFETY CONCERN TEMPLATES (replaces dating-conversation seeds) ───
    // Per operator decision (2026-05-12): community feed seeds are now safety
    // concerns (location-aware, area-aware, situational) — NOT dating chatter.
    // Templates use placeholders for city/neighborhood that get filled per-city
    // in the loop below.
    const SAFETY_CONCERN_TEMPLATES = [
      "Heads up — a few of us noticed an uptick in reported incidents on the late-night train route through {neighborhood} this week. If you can, ride near the conductor and avoid empty cars after 10 PM.",
      "Reminder for everyone in {city}: car break-ins have been creeping up around the {neighborhood} area. Take your bag, phone charger, and anything visible with you when you park.",
      "PSA for tonight — the {neighborhood} entertainment district gets crowded and rideshare impersonation has been a thing recently. Always confirm the license plate AND the driver's name in the app before getting in.",
      "Walking home alone after dark in {neighborhood}? Stick to lit streets, share your live location with a trusted contact, and consider starting a Safe Walk session in the app.",
      "If you're parking in a garage tonight in {city}, scan the area before getting out. Stay on the phone with someone or have your keys ready in your hand. Trust your gut.",
      "Quick reminder: if your gut says something is off, that's data. Leave. You don't owe anyone an explanation for prioritizing your safety.",
      "Several reports of harassment near {neighborhood} after midnight in the past few weeks. If you're heading out tonight, plan your ride home before you start drinking.",
      "Group going out tonight in {city}? Set a meet-up spot, agree on a no-one-leaves-alone rule, and screenshot each other's locations before you split up.",
      "Fyi — phone-snatching has been reported around busy corners in {neighborhood}. Keep your phone in a zipped pocket when walking, not in your hand.",
      "If a stranger asks you for help with something specific in a parking lot or stairwell, that's a known tactic. Stay near other people and call security if needed.",
      "Pro tip: if you're meeting someone for the first time, share their name + photo + your meet location with a friend BEFORE you leave. The Safety Vault makes this fast.",
      "Reminder that 911 isn't your only option — if you don't want to make noise, you can text 911 in most US cities. Also worth saving your trusted contact as an emergency contact in your phone."
    ];

    // ─── REPLY TEMPLATES (safety-focused) ───
    const SAFETY_REPLIES = [
      "Thank you for posting this. I'll be more aware in that area.",
      "Saving this for my group chat — appreciate the heads up.",
      "Confirming this — I had a similar experience near there last week. Stay safe everyone.",
      "Good reminder. I always forget to share my location and then regret it.",
      "Adding the Safe Walk session next time I'm out late, hadn't tried it yet.",
      "Appreciate you looking out for the community. This is exactly what this space is for.",
      "Going to forward this to my sister, she's in that area a lot."
    ];

    const INFO_REPLIES = [
      "What time of day was this? Trying to figure out when to avoid that area.",
      "Was the report on the transit line or near the station?",
      "Has anyone tried the Tether feature for nights out? Wondering if it works well.",
      "Do we know if the local PD has been notified? Want to make sure it's on their radar."
    ];

    // ─── CITIES + per-city neighborhood lists for templating ───
    const CITIES = ['Chicago', 'Dallas', 'Houston', 'Atlanta', 'Miami', 'Los Angeles', 'Philadelphia', 'New York'];
    const CITY_NEIGHBORHOODS = {
      'Chicago':      ['Wicker Park', 'Lincoln Park', 'River North', 'Logan Square', 'the Loop', 'Lakeview'],
      'Dallas':       ['Deep Ellum', 'Uptown', 'Bishop Arts', 'Knox-Henderson', 'Lower Greenville', 'Oak Lawn'],
      'Houston':      ['Montrose', 'The Heights', 'Midtown', 'EaDo', 'Rice Village', 'Washington Ave'],
      'Atlanta':      ['Buckhead', 'Midtown', 'Virginia-Highland', 'East Atlanta Village', 'Old Fourth Ward', 'Decatur'],
      'Miami':        ['Brickell', 'Wynwood', 'South Beach', 'Coconut Grove', 'Coral Gables', 'Little Havana'],
      'Los Angeles':  ['Silver Lake', 'West Hollywood', 'Santa Monica', 'DTLA', 'Venice', 'Los Feliz'],
      'Philadelphia': ['Rittenhouse', 'Fishtown', 'Northern Liberties', 'Old City', 'University City', 'East Passyunk'],
      'New York':     ['West Village', 'Williamsburg', 'Upper East Side', 'Astoria', 'Park Slope', 'Harlem']
    };

    // ─── PROCESS EACH CITY ───
    for (const cityName of CITIES) {
      const city = await getOne('SELECT id FROM cities WHERE name = $1', [cityName]);
      if (!city) {
        results.errors.push({ city: cityName, error: 'City not found in DB' });
        continue;
      }

      // Create seed accounts (reuse across cities)
      const accountMap = {};
      for (const acct of ACCOUNTS) {
        const slug = acct.name.toLowerCase().replace(/[^a-z]/g, '');
        const email = slug + '.' + cityName.toLowerCase().replace(/\s/g, '') + '@seed.safetea.local';
        const user = await getOne(
          `INSERT INTO users (email, password_hash, display_name, city, avatar_initial, avatar_color, avatar_type, is_verified, identity_verified, age_verified, gender_verified)
           VALUES ($1, $2, $3, $4, $5, $6, 'initial', true, true, true, true) RETURNING id`,
          [email, 'seed-account-no-login', acct.name, cityName, acct.name[0].toUpperCase(), acct.color]
        );
        accountMap[acct.name] = user.id;
        results.accounts_created++;
      }

      const accountNames = Object.keys(accountMap);
      const userIds = Object.values(accountMap);

      // Pick posts for this city — 5 safety concerns per city, rotated by city
      // index so each city's seed feed is unique. Templates use {city} and
      // {neighborhood} placeholders that get filled in below.
      const cityIdx = CITIES.indexOf(cityName);
      const cityNeighborhoods = (CITY_NEIGHBORHOODS[cityName] || ['downtown', 'midtown', 'the entertainment district']);
      const safetyPosts = [];

      for (let i = 0; i < 5; i++) {
        const tIdx = (cityIdx * 3 + i) % SAFETY_CONCERN_TEMPLATES.length;
        const neighborhood = cityNeighborhoods[i % cityNeighborhoods.length];
        const body = SAFETY_CONCERN_TEMPLATES[tIdx]
          .replace(/\{city\}/g, cityName)
          .replace(/\{neighborhood\}/g, neighborhood);
        safetyPosts.push({
          author: accountNames[i % accountNames.length],
          category: 'safety-concern',
          body: body
        });
      }

      const allPosts = safetyPosts;

      // Create posts with timestamps spread over last 7 days
      const now = Date.now();
      const postIds = [];

      for (let i = 0; i < allPosts.length; i++) {
        const post = allPosts[i];
        const userId = accountMap[post.author];
        if (!userId) continue;

        // Spread posts: oldest = 7 days ago, newest = 4 hours ago
        const daysAgo = 7 - Math.floor((i / allPosts.length) * 6.8);
        const hoursOffset = Math.floor(Math.random() * 14) + 7; // 7am-9pm
        const minutesOffset = Math.floor(Math.random() * 60);
        const postDate = new Date(now - (daysAgo * 86400000) + (hoursOffset * 3600000) + (minutesOffset * 60000));

        const postTitle = post.body.length > 60 ? post.body.substring(0, 57) + '...' : post.body;
        const newPost = await getOne(
          `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
           VALUES ($1, $2, $3, $4, $5, 'community', $6) RETURNING id`,
          [userId, postTitle, post.body, post.category, cityName, postDate.toISOString()]
        );
        postIds.push({ id: newPost.id, category: post.category });
        results.posts_created++;
      }

      // Add likes: 3-7 random likes per post
      for (const postInfo of postIds) {
        const numLikes = 3 + Math.floor(Math.random() * 5);
        const shuffled = userIds.slice().sort(() => Math.random() - 0.5);
        for (let j = 0; j < Math.min(numLikes, shuffled.length); j++) {
          try {
            await run(
              'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
              [postInfo.id, shuffled[j]]
            );
            results.likes_created++;
          } catch(e) {}
        }
      }

      // Add 1-3 replies to ~70% of posts
      for (const postInfo of postIds) {
        if (Math.random() > 0.7) continue;
        const numReplies = 1 + Math.floor(Math.random() * 3);

        for (let r = 0; r < numReplies; r++) {
          const replyUserId = userIds[Math.floor(Math.random() * userIds.length)];
          const pool = [...SAFETY_REPLIES, ...INFO_REPLIES];
          const replyText = pool[Math.floor(Math.random() * pool.length)];

          try {
            await run(
              'INSERT INTO replies (post_id, user_id, body, content, created_at) VALUES ($1, $2, $3, $3, $4)',
              [postInfo.id, replyUserId, replyText, new Date(now - Math.floor(Math.random() * 5 * 86400000)).toISOString()]
            );
            await run('UPDATE posts SET reply_count = COALESCE(reply_count, 0) + 1 WHERE id = $1', [postInfo.id]).catch(function() {});
            results.replies_created++;
          } catch(e) {}
        }
      }

      // Update like counts on posts (like_count column may not exist — skip if so)
      for (const postInfo of postIds) {
        try {
          const likeCount = await getOne('SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1', [postInfo.id]);
          await run('UPDATE posts SET like_count = $1 WHERE id = $2', [parseInt(likeCount.count), postInfo.id]);
        } catch(e) { /* like_count column may not exist */ }
      }

      // Update city post count
      const postCount = await getOne('SELECT COUNT(*) as count FROM posts WHERE city = $1', [cityName]);
      await run('UPDATE cities SET post_count = $1 WHERE id = $2', [parseInt(postCount.count), city.id]);
    }

    return res.status(200).json({
      success: true,
      message: 'Community feeds seeded successfully',
      ...results
    });
  } catch (error) {
    console.error('Seed community error:', error);
    return res.status(500).json({ error: 'Seeding failed', details: error.message, partial_results: results });
  }
};
