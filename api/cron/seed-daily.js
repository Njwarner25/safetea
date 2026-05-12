const { getOne, getMany, run } = require('../_utils/db');

/**
 * Daily community seeder — runs every 3 hours from 8am-11pm CT.
 * Each run picks 2-3 random cities, generates 1-2 organic posts per city
 * using AI, posted from existing seed accounts.
 *
 * Vercel cron: 0 8,11,14,17,20,23 * * *  (every 3 hours, 6 runs/day)
 * That's ~12-18 posts/day spread across 8 cities.
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

// Pivoted 2026-05-12 — community feed seeds are now safety concerns,
// not dating-conversation chatter. Category renamed accordingly.
const CATEGORIES = ['safety-concern'];

// Fallback posts if AI is unavailable — rotating pool of location-aware
// safety concerns. Use {neighborhood} / {transit} placeholders that are
// substituted in pickFallback() with the city's per-run picks.
const FALLBACK_SAFETY_CONCERNS = [
  "Heads up — uptick in reported incidents on the {transit} late-night route through {neighborhood} this week. Ride near the conductor and avoid empty cars after 10 PM.",
  "Several phone-snatching reports around busy corners in {neighborhood} lately. Keep your phone in a zipped pocket when walking, not in your hand.",
  "Car break-ins climbing around the {neighborhood} parking areas. Take your bag, charger, and anything visible with you when you park.",
  "Rideshare impersonation has been a thing in the {neighborhood} entertainment district. Confirm the plate AND the driver's name in the app before getting in.",
  "Walking home in {neighborhood} after dark? Stick to lit streets, share your live location with someone, or start a Safe Walk session in the app.",
  "Reminder for tonight: if your gut says something is off, that's data. Leave. You don't owe anyone an explanation for prioritizing your safety.",
  "Group going out tonight in {neighborhood}? Set a meet-up spot, agree on a no-one-leaves-alone rule, and screenshot each other's locations.",
  "If a stranger asks for help with something specific in a parking lot or stairwell, that's a known tactic. Stay near other people and call security if needed.",
  "Pro tip: meeting someone new? Share their name, photo, and your meet location with a friend BEFORE you leave. The Safety Vault makes it fast.",
  "PSA: in most US cities you can text 911 if you can't make noise. Worth saving your trusted contact as your phone's emergency contact too."
];


function pickRandom(arr, count) {
  var shuffled = arr.slice().sort(function() { return 0.5 - Math.random(); });
  return shuffled.slice(0, count);
}

async function generateAIPost(city, category) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;

  const ctx = CITY_CONTEXT[city];
  const hood = ctx.neighborhoods[Math.floor(Math.random() * ctx.neighborhoods.length)];
  // Pivoted 2026-05-12: feed is now safety concerns, not dating commentary.
  const catLabel = 'a calm, location-aware safety concern (transit incident report, area-awareness PSA, parking/rideshare caution, nighttime route reminder, or general situational-safety tip). NEVER frame as dating advice or red-flag-from-a-date — frame as awareness for everyone in the city, regardless of dating status.';

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
    // Pick 2-3 random cities for this run
    const citiesToSeed = pickRandom(CITIES, 2 + Math.floor(Math.random() * 2));

    for (const cityName of citiesToSeed) {
      // Find a random seed account in this city
      const seedAccount = await getOne(
        `SELECT id, display_name FROM users WHERE email LIKE $1 AND city = $2 ORDER BY RANDOM() LIMIT 1`,
        ['%@seed.safetea.local', cityName]
      );

      if (!seedAccount) {
        results.errors.push({ city: cityName, error: 'No seed accounts found' });
        continue;
      }

      // 1-2 posts per city per run
      const postCount = 1 + Math.floor(Math.random() * 2);
      for (let i = 0; i < postCount; i++) {
        // Alternate a different seed account for each post
        const account = i === 0 ? seedAccount : await getOne(
          `SELECT id, display_name FROM users WHERE email LIKE $1 AND city = $2 AND id != $3 ORDER BY RANDOM() LIMIT 1`,
          ['%@seed.safetea.local', cityName, seedAccount.id]
        ) || seedAccount;

        const category = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];

        // Try AI generation first, fall back to templates
        let body = await generateAIPost(cityName, category);
        let source = 'ai';

        if (!body) {
          // Pick a fallback safety concern and substitute the city's neighborhood + transit
          const ctxFallback = CITY_CONTEXT[cityName] || { neighborhoods: ['downtown'], transit: 'transit' };
          const hoodFallback = ctxFallback.neighborhoods[Math.floor(Math.random() * ctxFallback.neighborhoods.length)];
          const pool = FALLBACK_SAFETY_CONCERNS.map(function (t) {
            return t.replace(/\{neighborhood\}/g, hoodFallback).replace(/\{transit\}/g, ctxFallback.transit);
          });
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
