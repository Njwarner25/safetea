require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { pool } = require('./database');

async function migrate() {
  console.log('Running SafeTea database migrations...');

  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Enable UUID extension
    await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

    // Users table
    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        display_name TEXT NOT NULL,
        role TEXT DEFAULT 'member' CHECK(role IN ('member', 'moderator', 'admin')),
        city TEXT,
        state TEXT,
        is_verified BOOLEAN DEFAULT false,
        is_anonymous BOOLEAN DEFAULT true,
        avatar_initial TEXT,
        avatar_color TEXT,
        avatar_type TEXT DEFAULT 'initial',
        avatar_url TEXT,
        custom_display_name TEXT,
        subscription_tier TEXT DEFAULT 'free',
        stripe_customer_id TEXT,
        stripe_subscription_id TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        last_login TIMESTAMPTZ
      );
    `);

    // Posts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS posts (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        city TEXT NOT NULL,
        content TEXT NOT NULL,
        category TEXT DEFAULT 'general' CHECK(category IN ('general', 'warning', 'alert', 'question', 'positive')),
        is_anonymous BOOLEAN DEFAULT true,
        reply_count INTEGER DEFAULT 0,
        is_verified BOOLEAN DEFAULT false,
        is_flagged BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Replies table
    await client.query(`
      CREATE TABLE IF NOT EXISTS replies (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_anonymous BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Alerts table
    await client.query(`
      CREATE TABLE IF NOT EXISTS alerts (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        city TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('safety', 'scam', 'stalking', 'general')),
        title TEXT NOT NULL,
        description TEXT,
        location TEXT,
        severity TEXT DEFAULT 'medium' CHECK(severity IN ('low', 'medium', 'high', 'critical')),
        report_count INTEGER DEFAULT 1,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // City votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS city_votes (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        city_name TEXT NOT NULL,
        state TEXT,
        vote_count INTEGER DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // User city votes (prevent duplicates)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_city_votes (
        user_id TEXT NOT NULL REFERENCES users(id),
        city_vote_id TEXT NOT NULL REFERENCES city_votes(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        PRIMARY KEY (user_id, city_vote_id)
      );
    `);

    // Sessions table for token blacklisting
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        token_hash TEXT NOT NULL,
        expires_at TIMESTAMPTZ NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Messages table (premium DM system)
    await client.query(`
      CREATE TABLE IF NOT EXISTS messages (
        id SERIAL PRIMARY KEY,
        sender_id TEXT NOT NULL REFERENCES users(id),
        recipient_id TEXT NOT NULL REFERENCES users(id),
        content TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Referrals table
    await client.query(`
      CREATE TABLE IF NOT EXISTS referrals (
        id SERIAL PRIMARY KEY,
        referrer_id TEXT NOT NULL REFERENCES users(id),
        person_name TEXT NOT NULL,
        person_city TEXT,
        person_state TEXT,
        relationship TEXT,
        description TEXT,
        photo_url TEXT,
        vouch_count INTEGER DEFAULT 1,
        is_verified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_city ON posts(city)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_user ON posts(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_alerts_city ON alerts(city)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_replies_post ON replies(post_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_city_votes_name ON city_votes(city_name)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_users_email ON users(email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_messages_created ON messages(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_referrals_referrer ON referrals(referrer_id)');

    await client.query('COMMIT');
    console.log('Migrations completed successfully!');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Migration failed:', err);
    throw err;
  } finally {
    client.release();
  }
}

// Run if called directly
if (require.main === module) {
  migrate()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
} else {
  module.exports = migrate;
}
