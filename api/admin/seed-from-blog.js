'use strict';

/**
 * POST /api/admin/seed-from-blog
 *
 * Seeds 3 topic-grounded community posts per city (8 cities × 3 blog topics = 24 posts).
 * Each post is grounded in one of SafeTea's published blog articles and voiced as
 * a real woman sharing safety advice or experience. Occasionally includes a verified
 * stat from RAINN, CDC, or NSVRC woven in naturally.
 *
 * Auth: x-migrate-secret header or ?secret= query param.
 * Idempotent: skips cities where a seed post referencing the same blog slug
 * already exists in the last 30 days.
 */

const { getOne, getMany, run } = require('../_utils/db');

const CITIES = ['Chicago', 'Dallas', 'Houston', 'Atlanta', 'Miami', 'Los Angeles', 'Philadelphia', 'New York'];

const CITY_CONTEXT = {
  'Chicago':       { neighborhoods: ['Lincoln Park', 'Wicker Park', 'River North', 'Logan Square'], transit: 'CTA', vibe: 'midwest, direct, loyal' },
  'Dallas':        { neighborhoods: ['Deep Ellum', 'Uptown', 'Bishop Arts', 'Knox-Henderson'],       transit: 'DART', vibe: 'southern charm, big energy' },
  'Houston':       { neighborhoods: ['Montrose', 'The Heights', 'Midtown', 'Rice Village'],          transit: 'Metro', vibe: 'diverse, warm, unpretentious' },
  'Atlanta':       { neighborhoods: ['Buckhead', 'Midtown', 'Virginia-Highland', 'Old Fourth Ward'], transit: 'MARTA', vibe: 'confident, cultured, southern-meets-urban' },
  'Miami':         { neighborhoods: ['Brickell', 'Wynwood', 'South Beach', 'Coconut Grove'],         transit: 'Metrorail', vibe: 'glamorous, bilingual, nightlife-heavy' },
  'Los Angeles':   { neighborhoods: ['Silver Lake', 'West Hollywood', 'Venice', 'Los Feliz'],        transit: 'Metro', vibe: 'chill, creative, health-conscious' },
  'Philadelphia':  { neighborhoods: ['Rittenhouse', 'Fishtown', 'Old City', 'East Passyunk'],        transit: 'SEPTA', vibe: 'real, no-nonsense, passionate' },
  'New York':      { neighborhoods: ['West Village', 'Williamsburg', 'Astoria', 'Park Slope'],       transit: 'subway', vibe: 'fast-paced, diverse, opinionated' }
};

// Verified stats from RAINN, CDC, NSVRC — woven in ~30% of posts
const STAT_POOL = [
  'RAINN reports that 1 in 6 American women has experienced attempted or completed rape in her lifetime.',
  'According to RAINN, only 310 out of every 1,000 sexual assaults are ever reported to police.',
  'The CDC found that nearly 1 in 5 women in the US has experienced rape at some point in their lives.',
  'Women ages 18-24 are most at risk — RAINN says college-age women are 3x more likely to experience sexual violence.',
  'The CDC found 1 in 4 women experience severe intimate partner physical violence.',
  'NSVRC research shows 94% of women who are raped experience PTSD during the weeks following the assault.',
  'According to RAINN, someone is sexually assaulted in America every 68 seconds.'
];

// Blog topics — inlined to avoid Vercel filesystem path issues
const BLOG_TOPICS = [
  {
    slug: '10-red-flags-ai-detects-dating-profiles',
    title: '10 Red Flags AI Can Spot on a Dating Profile',
    keyPoints: [
      'stolen or stock photos caught by AI reverse image search',
      'inconsistent age and location data across the profile',
      'no connected social media presence',
      'overly polished or scripted bios that match scam templates',
      'pressure to move off the app to WhatsApp or Telegram immediately',
      'love-bombing language in early messages (soulmate, destiny)',
      'brand-new account with only one or two photos',
      'refusal to video chat',
      'any mention of money, crypto, or financial hardship early on',
      'copy-pasted opening messages sent to many people'
    ]
  },
  {
    slug: 'safewalk-date-sharing-privacy-guide',
    title: 'How SafeWalk Helps You Share Your Date Without Sharing Your Privacy',
    keyPoints: [
      'share your date details with up to five trusted contacts',
      'timed check-ins that alert contacts automatically if you miss one',
      'panic button that sends your current location immediately',
      'sharing stops the moment you end the session — no persistent tracking',
      'data is encrypted and not stored after the session ends',
      'better than texting a friend because it has automated failsafes',
      'only activates when you need it, not 24/7 like Find My Friends'
    ]
  },
  {
    slug: 'facebook-groups-dating-safety-failure',
    title: 'Why Facebook Groups Fail at Dating Safety',
    keyPoints: [
      'AWDTSG groups prove women desperately need community safety tools',
      'Facebook deletes entire groups overnight with no warning or backup',
      'screenshots leak to the person being discussed, creating real danger',
      'moderator burnout is inevitable with no tools or compensation',
      'no identity verification means anyone can post anything',
      'purpose-built platforms have permanence, verified members, and legal frameworks',
      'your safety network should not depend on a platform that can vanish tomorrow'
    ]
  }
];

function pickRandom(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function generatePost(city, blog, includeStat) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const ctx = CITY_CONTEXT[city];
  const hood = pickRandom(ctx.neighborhoods);
  const points = blog.keyPoints.slice().sort(function() { return 0.5 - Math.random(); }).slice(0, 3);
  const stat = includeStat ? pickRandom(STAT_POOL) : null;

  const statLine = stat
    ? `Optionally weave in this real stat naturally (don't just quote it verbatim): "${stat}"`
    : 'Do not include statistics in this post.';

  const prompt =
    `Write a single short community post (1-3 sentences) for a women's safety app called SafeTea. ` +
    `The post is from a woman in ${city} sharing a safety insight, personal experience, or tip. ` +
    `Ground it in one or more of these specific points from a SafeTea article titled "${blog.title}": ${points.join('; ')}. ` +
    `${statLine} ` +
    `Style: casual, authentic, like texting your group chat. City vibe: ${ctx.vibe}. Occasionally reference ${hood} or the ${ctx.transit}. ` +
    `Use 0-1 emojis. No hashtags. No "Ladies" opener. Vary tone — sometimes a tip, sometimes a personal story, sometimes a PSA. ` +
    `Output ONLY the post text, nothing else.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 220,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.content && data.content[0] && data.content[0].text;
    if (!text || text.length < 15 || text.length > 600) return null;
    return text.trim();
  } catch (e) {
    console.error('[seed-from-blog] AI error:', e.message);
    return null;
  }
}

// Fallbacks keyed by blog slug in case AI is unavailable
const FALLBACKS = {
  '10-red-flags-ai-detects-dating-profiles': [
    "If he refuses to video chat before a first date, that IS your answer. AI can flag a lot of red flags but your gut can catch the rest 🚩",
    "Reverse image search every profile pic before you meet. Takes 30 seconds and could save you a nightmare.",
    "Love-bombing in the first week of talking is a textbook scam pattern. Real connection builds slowly, not overnight."
  ],
  'safewalk-date-sharing-privacy-guide': [
    "Texting your friend 'I'm at the restaurant' is not a safety plan. Set up a real check-in system before your next date.",
    "If you miss a check-in and your friend doesn't notice for hours, that's a gap in your safety net. Automated check-ins exist for exactly this.",
    "Your location should only be shared when YOU activate it — not 24/7. That's the difference between a safety tool and surveillance."
  ],
  'facebook-groups-dating-safety-failure': [
    "A safety community that can be deleted overnight by a platform you don't control is not a real safety plan. Think about that.",
    "The AWDTSG movement showed that women NEED community safety tools. But a Facebook group that disappears tomorrow isn't it.",
    "No verification, no moderation tools, no backup — that's what happens when safety runs on someone else's social network."
  ]
};

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const summary = { seeded: [], skipped: [], errors: [] };

  try {
    for (const blog of BLOG_TOPICS) {
      for (const cityName of CITIES) {
        // Dedup: skip if any seed post referencing this blog slug exists in last 30 days
        const existing = await getOne(
          `SELECT id FROM posts
           WHERE city = $1
             AND body ILIKE $2
             AND user_id IN (SELECT id FROM users WHERE email LIKE '%@seed.safetea.local')
             AND created_at > NOW() - INTERVAL '30 days'
           LIMIT 1`,
          [cityName, '%' + blog.slug.replace(/-/g, '%') + '%']
        ).catch(function() { return null; });

        // Also check by rough topic match (key phrase from each blog)
        const topicChecks = {
          '10-red-flags-ai-detects-dating-profiles': 'reverse image search',
          'safewalk-date-sharing-privacy-guide': 'check-in',
          'facebook-groups-dating-safety-failure': 'facebook group'
        };
        const topicPhrase = topicChecks[blog.slug];
        const topicDupe = topicPhrase ? await getOne(
          `SELECT id FROM posts
           WHERE city = $1
             AND body ILIKE $2
             AND user_id IN (SELECT id FROM users WHERE email LIKE '%@seed.safetea.local')
             AND created_at > NOW() - INTERVAL '30 days'
           LIMIT 1`,
          [cityName, '%' + topicPhrase + '%']
        ).catch(function() { return null; }) : null;

        if (existing || topicDupe) {
          summary.skipped.push({ city: cityName, blog: blog.slug, reason: 'recent_dupe' });
          continue;
        }

        // Find a seed account in this city
        const account = await getOne(
          `SELECT id, display_name FROM users
           WHERE email LIKE '%@seed.safetea.local' AND city = $1
           ORDER BY RANDOM() LIMIT 1`,
          [cityName]
        );
        if (!account) {
          summary.errors.push({ city: cityName, blog: blog.slug, error: 'no_seed_account' });
          continue;
        }

        // ~30% chance to include a stat
        const includeStat = Math.random() < 0.3;
        let body = await generatePost(cityName, blog, includeStat);
        let source = 'ai';

        if (!body) {
          const fallbackPool = FALLBACKS[blog.slug] || [];
          body = pickRandom(fallbackPool) || null;
          source = 'fallback';
        }

        if (!body) {
          summary.errors.push({ city: cityName, blog: blog.slug, error: 'no_content' });
          continue;
        }

        const title = body.length > 60 ? body.substring(0, 57) + '…' : body;

        const newPost = await getOne(
          `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
           VALUES ($1, $2, $3, 'tea-talk', $4, 'community', NOW()) RETURNING id`,
          [account.id, title, body, cityName]
        );

        // Add 3-6 seed likes so the post ranks in the feed (sorted by engagement)
        if (newPost && newPost.id) {
          const likers = await getMany(
            `SELECT id FROM users WHERE email LIKE '%@seed.safetea.local' AND city = $1 AND id != $2 ORDER BY RANDOM() LIMIT 6`,
            [cityName, account.id]
          ).catch(function() { return []; });
          const likeCount = 3 + Math.floor(Math.random() * 4);
          for (let li = 0; li < Math.min(likeCount, likers.length); li++) {
            await run(
              'INSERT INTO post_likes (post_id, user_id) VALUES ($1, $2) ON CONFLICT (post_id, user_id) DO NOTHING',
              [newPost.id, likers[li].id]
            ).catch(function() {});
          }
        }

        summary.seeded.push({ city: cityName, blog: blog.slug, source, author: account.display_name, preview: body.substring(0, 80) });
      }
    }

    console.log('[seed-from-blog] Done. Seeded:', summary.seeded.length, 'Skipped:', summary.skipped.length, 'Errors:', summary.errors.length);
    return res.status(200).json({ success: true, ...summary, counts: { seeded: summary.seeded.length, skipped: summary.skipped.length, errors: summary.errors.length } });
  } catch (err) {
    console.error('[seed-from-blog] Fatal:', err.message);
    return res.status(500).json({ error: err.message, partial: summary });
  }
};
