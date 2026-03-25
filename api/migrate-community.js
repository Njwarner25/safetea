const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Verify migration secret
    const secret = req.headers['migrate-secret'] || req.headers['x-migrate-secret'];
    const envSecret = process.env.MIGRATE_SECRET || 'my-migrate-secret-123';
    if (!secret || secret !== envSecret) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Create cities table
    await run(
      `CREATE TABLE IF NOT EXISTS cities (
        id SERIAL PRIMARY KEY,
        name VARCHAR NOT NULL,
        slug VARCHAR UNIQUE NOT NULL,
        emoji VARCHAR,
        image_url TEXT,
        is_active BOOLEAN DEFAULT true,
        post_count INTEGER DEFAULT 0,
        user_count INTEGER DEFAULT 0,
        created_at TIMESTAMP DEFAULT NOW()
      )`,
      []
    );

    // Add city column to users table if it doesn't exist
    await run(
      'ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR',
      []
    );

    // Add city column to posts table if it doesn't exist
    await run(
      'ALTER TABLE posts ADD COLUMN IF NOT EXISTS city VARCHAR',
      []
    );

    // Add category column to posts table if it doesn't exist
    await run(
      "ALTER TABLE posts ADD COLUMN IF NOT EXISTS category VARCHAR DEFAULT 'tea-talk'",
      []
    );

    // Create index on posts(city, category)
    await run(
      'CREATE INDEX IF NOT EXISTS idx_posts_city_category ON posts(city, category)',
      []
    );

    // Seed the 8 launch cities
    const cities = [
      { name: 'Chicago', slug: 'chicago', emoji: '🏙️' },
      { name: 'New York', slug: 'new-york', emoji: '🗽' },
      { name: 'Los Angeles', slug: 'los-angeles', emoji: '☀️' },
      { name: 'Dallas', slug: 'dallas', emoji: '⭐' },
      { name: 'Miami', slug: 'miami', emoji: '🌴' },
      { name: 'Houston', slug: 'houston', emoji: '🤠' },
      { name: 'Atlanta', slug: 'atlanta', emoji: '🍑' },
      { name: 'Boston', slug: 'boston', emoji: '🎓' }
    ];

    for (const city of cities) {
      await run(
        `INSERT INTO cities (name, slug, emoji, is_active, post_count, user_count)
         VALUES ($1, $2, $3, true, 0, 0)
         ON CONFLICT (slug) DO NOTHING`,
        [city.name, city.slug, city.emoji]
      );
    }

    return res.status(200).json({
      success: true,
      message: 'Migration completed successfully',
      cities_seeded: cities.length
    });
  } catch (error) {
    console.error('Error during migration:', error);
    return res.status(500).json({ error: 'Migration failed' });
  }
};
