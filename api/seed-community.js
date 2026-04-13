const { sql } = require('@vercel/postgres');
const { getOne, getMany, run } = require('./_utils/db');

/**
 * Seed community feeds with realistic content.
 * POST /api/seed-community?secret=MIGRATE_SECRET
 *
 * Creates seed accounts per city and populates posts, replies, and likes
 * with backdated timestamps spread over 7 days.
 */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = { accounts_deleted: 0, accounts_created: 0, posts_created: 0, replies_created: 0, likes_created: 0, errors: [] };

  try {
    // ─── CLEAN UP OLD SEED DATA ───
    const oldAccounts = await getMany("SELECT id FROM users WHERE email LIKE '%@seed.safetea.local'");
    for (const acct of oldAccounts) {
      await run('DELETE FROM post_likes WHERE user_id = $1', [acct.id]);
      await run('DELETE FROM replies WHERE user_id = $1', [acct.id]);
      await run('DELETE FROM posts WHERE user_id = $1', [acct.id]);
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

    // ─── TEA TALK TEMPLATES (user-provided + variations) ───
    const TEA_TALK_TEMPLATES = [
      "Girl, if he won't video chat before the first date that's a red flag. Always verify who you're talking to 🚩",
      "PSA: never let a first date pick you up from your home. Meet in public, share your location with a friend, and check in with SafeTea 📍",
      "Went on a date last week and used the Check-In feature — my bestie got the live tracking link and I felt so much safer knowing someone had my back 💕",
      "Reminder: if someone pressures you to move off the dating app to a private chat too fast, slow down. That's a common tactic 🛑",
      "If his profile says \"just here for fun\" believe him the first time. Don't convince yourself you'll be the exception",
      "Pro tip: Google image search their profile pics before the first date. You'd be surprised what comes up 🔍",
      "He said he was 28 on the app but looked 40 in person. Always FaceTime first ladies, it saves you the Uber fare 😅",
      "Just a reminder that \"I'm not like other guys\" is actually the most common thing other guys say",
      "Told him I was sharing my location with a friend and he got weird about it. That told me everything I needed to know 🚩",
      "If he can't plan a date — like actually pick a place and a time — he's not ready for a relationship. Period.",
      "Three first dates this month where the guy showed up looking nothing like his photos. I'm exhausted 😭",
      "Trust the energy, not the words. When something feels off it usually IS off. Your gut is trying to protect you 💫"
    ];

    // ─── GOOD GUYS TEMPLATES (user-provided + variations) ───
    const GOOD_GUYS_TEMPLATES = [
      "Shoutout to the guy who walked me to my car after our coffee date without me even asking. The bar is low but that was sweet 💚",
      "Had an amazing first date at a public park — he suggested it because he said he wanted me to feel safe. Green flag 🟢",
      "My date noticed I shared my location with a friend and said 'that's smart, I'm glad you do that.' We need more of this energy 💛",
      "He texted me when he got home to make sure I got in safe too. Small thing but it meant everything",
      "Went on a date and he asked what my boundaries were before anything happened. Consent is so attractive honestly 🥹",
      "This man remembered I mentioned a work deadline and texted me good luck the morning of. It's the little things",
      "He offered to meet near MY neighborhood so I wouldn't have to travel far at night. Thoughtful kings exist",
      "My date saw me looking uncomfortable when a group got loud next to us and suggested we move without me saying a word. Awareness is everything 💛",
      "Positive update: the guy I was nervous about? 4 dates in and he's been nothing but consistent and respectful. Don't give up queens 🤞",
      "He told me on the first date exactly what he was looking for. No games, no mixed signals. Honesty is so refreshing"
    ];

    // ─── REPLY TEMPLATES ───
    const TEA_REPLIES = [
      "Thank you for posting this!! I almost matched with someone like this",
      "Ugh I'm so sorry this happened. The streets need to know 🫖",
      "This is why I love SafeTea. We gotta look out for each other 💕",
      "Girl I went through the SAME thing. You dodged a bullet 🙏",
      "Block him on everything and don't look back. You deserve better",
      "Adding to this — I think I had a similar experience last month",
      "The audacity of some people honestly. Thanks for the warning sis",
      "Screenshot and save everything, just in case. Stay safe out there"
    ];

    const GOOD_REPLIES = [
      "Okay this actually made me smile. There IS hope 😭",
      "We love to see it!! Keep us updated!",
      "His mom raised him RIGHT 👏",
      "This gives me hope honestly. Happy for you ❤️",
      "THIS is the content I need. Happy for you queen",
      "Proof that they DO exist. Don't settle ladies",
      "The way this made my whole day. Rooting for you two! 🥹"
    ];

    const INFO_REPLIES = [
      "What app was he on?",
      "What area of the city? Asking for... myself honestly 👀",
      "How long ago was this? I might have matched with someone similar",
      "Was this recent? My friend is dating in that area right now"
    ];

    // ─── CITIES ───
    const CITIES = ['Chicago', 'Dallas', 'Houston', 'Atlanta', 'Miami', 'Los Angeles', 'Philadelphia', 'New York'];

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

      // Pick posts for this city — 4-5 tea talk + 4-5 good guys
      // Rotate through templates with city-specific offset to avoid identical feeds
      const cityIdx = CITIES.indexOf(cityName);
      const teaPosts = [];
      const goodPosts = [];

      for (let i = 0; i < 5; i++) {
        const tIdx = (cityIdx * 3 + i) % TEA_TALK_TEMPLATES.length;
        teaPosts.push({
          author: accountNames[i % accountNames.length],
          category: 'tea-talk',
          body: TEA_TALK_TEMPLATES[tIdx]
        });
      }

      for (let i = 0; i < 4; i++) {
        const gIdx = (cityIdx * 2 + i) % GOOD_GUYS_TEMPLATES.length;
        goodPosts.push({
          author: accountNames[(i + 5) % accountNames.length],
          category: 'good-guys',
          body: GOOD_GUYS_TEMPLATES[gIdx]
        });
      }

      const allPosts = [...teaPosts, ...goodPosts];

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
          const pool = postInfo.category === 'tea-talk'
            ? [...TEA_REPLIES, ...INFO_REPLIES]
            : GOOD_REPLIES;
          const replyText = pool[Math.floor(Math.random() * pool.length)];

          try {
            await run(
              'INSERT INTO replies (post_id, user_id, body, content, created_at) VALUES ($1, $2, $3, $3, $4)',
              [postInfo.id, replyUserId, replyText, new Date(now - Math.floor(Math.random() * 5 * 86400000)).toISOString()]
            );
            await run('UPDATE posts SET reply_count = reply_count + 1 WHERE id = $1', [postInfo.id]);
            results.replies_created++;
          } catch(e) {}
        }
      }

      // Update like counts on posts
      for (const postInfo of postIds) {
        const likeCount = await getOne('SELECT COUNT(*) as count FROM post_likes WHERE post_id = $1', [postInfo.id]);
        await run('UPDATE posts SET like_count = $1 WHERE id = $2', [parseInt(likeCount.count), postInfo.id]);
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
