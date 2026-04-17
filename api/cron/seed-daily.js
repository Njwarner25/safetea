const { getOne, getMany, run } = require('../_utils/db');

/**
 * Daily community seeder — runs every 3 hours.
 * Each run seeds ALL 8 cities with 1 organic post each (AI-generated),
 * posted from existing seed accounts. Guarantees daily coverage across
 * every city.
 *
 * Vercel cron: 0 13,16,19,22,1,4 * * *  (every 3 hours, 6 runs/day)
 * That's ~48 posts/day — 6 per city per day across all 8 cities.
 */

const CITIES = ['Chicago', 'Dallas', 'Houston', 'Atlanta', 'Miami', 'Los Angeles', 'Philadelphia', 'New York'];

// City-specific flavor for more authentic posts
const CITY_CONTEXT = {
  'Chicago': { neighborhoods: ['Lincoln Park', 'Wicker Park', 'Logan Square', 'River North', 'Lakeview', 'West Loop'], transit: 'CTA', vibe: 'midwest, direct, loyal' },
  'Dallas': { neighborhoods: ['Deep Ellum', 'Uptown', 'Bishop Arts', 'Oak Lawn', 'Knox-Henderson', 'Lower Greenville'], transit: 'DART', vibe: 'southern charm, big energy' },
  'Houston': { neighborhoods: ['Montrose', 'The Heights', 'Midtown', 'EaDo', 'Rice Village', 'Washington Ave'], transit: 'Metro', vibe: 'diverse, warm, unpretentious' },
  'Atlanta': { neighborhoods: ['Buckhead', 'Midtown', 'Virginia-Highland', 'East Atlanta Village', 'Old Fourth Ward', 'Decatur'], transit: 'MARTA', vibe: 'confident, cultured, southern-meets-urban' },
  'Miami': { neighborhoods: ['Brickell', 'Wynwood', 'Coconut Grove', 'South Beach', 'Coral Gables', 'Little Havana'], transit: 'Metrorail', vibe: 'glamorous, bilingual, nightlife-heavy' },
  'Los Angeles': { neighborhoods: ['Silver Lake', 'West Hollywood', 'Santa Monica', 'DTLA', 'Venice', 'Los Feliz'], transit: 'Metro', vibe: 'chill, creative, health-conscious' },
  'Philadelphia': { neighborhoods: ['Rittenhouse', 'Fishtown', 'Northern Liberties', 'Old City', 'University City', 'East Passyunk'], transit: 'SEPTA', vibe: 'real, no-nonsense, passionate' },
  'New York': { neighborhoods: ['West Village', 'Williamsburg', 'Upper East Side', 'Astoria', 'Park Slope', 'Harlem'], transit: 'subway', vibe: 'fast-paced, diverse, opinionated' }
};

const CATEGORIES = ['tea-talk', 'good-guys'];

// Fallback posts if AI is unavailable — rotating pool so they don't repeat
const FALLBACK_TEA_TALK = [
  "Ladies please stop ignoring red flags because he's cute. Cute doesn't equal safe 🚩",
  "If he gets mad when you say you want to meet in public first... that IS the answer",
  "Normalize checking in with your girls during a date. It's not paranoid, it's smart 💕",
  "He unmatched me after I asked to video chat first. The trash took itself out 🗑️",
  "Reminder: a man who respects you will never make you feel bad for having boundaries",
  "If his dating profile has zero effort, imagine the relationship 😬",
  "Stop giving out your address before the third date. I don't care how well it's going",
  "Went on a date and he was on his phone the entire time. Never again",
  "If he only texts you after 10pm he's not interested, he's bored",
  "A guy got upset that I told my friend where I was going. Sir, that's basic safety not a trust issue"
];

const FALLBACK_GOOD_GUYS = [
  "He remembered my coffee order from our first date. It's the small things 🥹",
  "Shoutout to the man who texted me 'let me know you got home safe' after every single date",
  "My date held the door, pulled out my chair, and asked genuine questions. Chivalry isn't dead y'all 💚",
  "He noticed I seemed anxious and said 'we can leave whenever you want, no pressure.' Green flag 🟢",
  "First date energy check: he suggested a daytime coffee date because he said he wanted me to feel comfortable. More of this please",
  "This guy sends me a good morning text every day and hasn't missed once in 3 weeks. Consistency matters",
  "He asked me about my career goals on the first date instead of just complimenting my looks. Yes sir 👏",
  "My date planned the whole evening AND had a backup plan in case I didn't like the first restaurant. Effort is attractive",
  "He saw me reach for my wallet and said 'I invited you, I got it.' Then didn't hold it over my head. That's the standard",
  "Had a date cancel because he was sick and he actually rescheduled for the next day instead of ghosting. Low bar but I'll take it 😅"
];

async function generateAIPost(city, category) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const ctx = CITY_CONTEXT[city];
  const hood = ctx.neighborhoods[Math.floor(Math.random() * ctx.neighborhoods.length)];
  const catLabel = category === 'tea-talk' ? 'dating red flag warning / safety tip / cautionary story' : 'positive dating experience / good guy shoutout / green flag moment';

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
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: `Write a single short social media post (1-3 sentences) for a women's dating safety community in ${city}. The post should be a ${catLabel}. Style: casual, relatable, like a real woman posting to her friends. Occasionally reference ${city} details like ${hood} or the ${ctx.transit}. Vibe: ${ctx.vibe}. Use 0-2 emojis max. Do NOT use hashtags. Do NOT start with "Hey" or "Ladies". Vary the tone — sometimes funny, sometimes serious, sometimes a quick tip. Output ONLY the post text, nothing else.`
        }]
      })
    });

    if (!resp.ok) return null;
    const data = await resp.json();
    const text = data.content && data.content[0] && data.content[0].text;
    if (!text || text.length < 10 || text.length > 500) return null;
    return text.trim();
  } catch (e) {
    console.error('[SeedDaily] AI generation failed:', e.message);
    return null;
  }
}

module.exports = async function handler(req, res) {
  // Vercel cron sends GET requests
  if (req.method === 'OPTIONS') { res.setHeader('Access-Control-Allow-Origin', '*'); return res.status(200).end(); }

  // Auth: Vercel cron or manual with secret
  const cronHeader = req.headers['x-vercel-cron'];
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!cronHeader && secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = { posts: [], errors: [] };

  try {
    // Seed all 8 cities every run to guarantee daily coverage
    const citiesToSeed = CITIES;

    for (const cityName of citiesToSeed) {
      // Find a random seed account in this city
      const account = await getOne(
        `SELECT id, display_name FROM users WHERE email LIKE $1 AND city = $2 ORDER BY RANDOM() LIMIT 1`,
        ['%@seed.safetea.local', cityName]
      );

      if (!account) {
        results.errors.push({ city: cityName, error: 'No seed accounts found' });
        continue;
      }

      // 1 post per city per run (6 runs/day = 6 posts/city/day)
      {
        const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

        // Try AI generation first, fall back to templates
        let body = await generateAIPost(cityName, category);
        let source = 'ai';

        if (!body) {
          const pool = category === 'tea-talk' ? FALLBACK_TEA_TALK : FALLBACK_GOOD_GUYS;
          // Pick one that hasn't been recently used in this city (check last 20 posts)
          const recent = await getMany(
            `SELECT body FROM posts WHERE city = $1 AND user_id IN (SELECT id FROM users WHERE email LIKE '%@seed.safetea.local') ORDER BY created_at DESC LIMIT 20`,
            [cityName]
          );
          const recentBodies = recent.map(r => r.body);
          const unused = pool.filter(p => recentBodies.indexOf(p) === -1);
          body = unused.length > 0 ? unused[Math.floor(Math.random() * unused.length)] : pool[Math.floor(Math.random() * pool.length)];
          source = 'fallback';
        }

        // Check for duplicate — skip if this exact text was posted in this city recently
        const dupe = await getOne(
          `SELECT id FROM posts WHERE city = $1 AND body = $2 AND created_at > NOW() - INTERVAL '7 days'`,
          [cityName, body]
        );
        if (dupe) continue;

        // Generate a short title from the body
        const title = body.length > 60 ? body.substring(0, 57) + '...' : body;

        // Insert post
        await run(
          `INSERT INTO posts (user_id, title, body, category, city, feed, created_at)
           VALUES ($1, $2, $3, $4, $5, 'community', NOW())`,
          [account.id, title, body, category, cityName]
        );

        results.posts.push({ city: cityName, account: account.display_name, category, source, preview: body.substring(0, 60) });
      }
    }

    console.log('[SeedDaily] Seeded', results.posts.length, 'posts across', citiesToSeed.join(', '));
    return res.status(200).json({ success: true, ...results });
  } catch (err) {
    console.error('[SeedDaily] Error:', err);
    return res.status(500).json({ error: 'Seed failed', details: err.message });
  }
};
