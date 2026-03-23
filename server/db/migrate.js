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
        is_active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Add is_active column if it doesn't exist (migration for existing databases)
    await client.query(`
      ALTER TABLE IF EXISTS city_votes
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT false;
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

    // Watched names table (Name Watch feature - Pro tier)
    await client.query(`
      CREATE TABLE IF NOT EXISTS watched_names (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        display_name TEXT NOT NULL,
        search_terms TEXT[] NOT NULL DEFAULT '{}',
        match_count INTEGER DEFAULT 0,
        last_match_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Name Watch matches table (tracks which posts matched which watched names)
    await client.query(`
      CREATE TABLE IF NOT EXISTS name_watch_matches (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        watched_name_id TEXT NOT NULL REFERENCES watched_names(id) ON DELETE CASCADE,
        post_id TEXT NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
        match_type TEXT NOT NULL CHECK(match_type IN ('exact', 'partial', 'initials')),
        matched_term TEXT NOT NULL,
        is_read BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(watched_name_id, post_id)
      );
    `);

    // Indexes
    await client.query('CREATE INDEX IF NOT EXISTS idx_watched_names_user ON watched_names(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_name_watch_matches_watched ON name_watch_matches(watched_name_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_name_watch_matches_post ON name_watch_matches(post_id)');
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

    // ===== NEW TABLES: Safety Features (March 2026) =====

    // Add is_suspended column to users table
    await client.query(`
      ALTER TABLE IF EXISTS users
      ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false;
    `);

    // Photos table (stores watermarked images)
    await client.query(`
      CREATE TABLE IF NOT EXISTS photos (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        image_data TEXT NOT NULL,
        context TEXT DEFAULT 'general' CHECK(context IN ('referral', 'avatar', 'post', 'general')),
        context_id TEXT,
        original_size INTEGER,
        is_deleted BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Photo watermarks table (forensic trail)
    await client.query(`
      CREATE TABLE IF NOT EXISTS photo_watermarks (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        photo_id TEXT NOT NULL REFERENCES photos(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        watermark_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Removal requests table (public-facing)
    await client.query(`
      CREATE TABLE IF NOT EXISTS removal_requests (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        case_number TEXT UNIQUE NOT NULL,
        requester_name TEXT NOT NULL,
        requester_email TEXT NOT NULL,
        relationship TEXT DEFAULT 'self' CHECK(relationship IN ('self', 'known_person')),
        photo_data TEXT,
        context TEXT,
        watermark_detected BOOLEAN DEFAULT false,
        watermark_user_id TEXT,
        status TEXT DEFAULT 'submitted' CHECK(status IN ('submitted', 'watermark_verified', 'reviewing', 'match_found', 'removed', 'no_match', 'unverified', 'closed')),
        matched_photo_id TEXT,
        sla_deadline TIMESTAMPTZ,
        resolution_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
    `);

    // User strikes table (ban system)
    await client.query(`
      CREATE TABLE IF NOT EXISTS user_strikes (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        strike_number INTEGER NOT NULL DEFAULT 1,
        reason TEXT NOT NULL,
        removal_request_id TEXT,
        suspension_start TIMESTAMPTZ DEFAULT NOW(),
        suspension_end TIMESTAMPTZ,
        appeal_status TEXT DEFAULT 'none' CHECK(appeal_status IN ('none', 'pending', 'approved', 'denied')),
        appeal_reason TEXT,
        appeal_resolved_at TIMESTAMPTZ,
        admin_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Bug reports table
    await client.query(`
      CREATE TABLE IF NOT EXISTS bug_reports (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        category TEXT NOT NULL CHECK(category IN ('crash', 'visual', 'feature_broken', 'performance', 'other')),
        description TEXT NOT NULL,
        screenshot TEXT,
        device_model TEXT,
        os_version TEXT,
        app_version TEXT,
        build_number TEXT,
        screen_trail JSONB DEFAULT '[]',
        network_type TEXT,
        status TEXT DEFAULT 'new' CHECK(status IN ('new', 'triaging', 'in_progress', 'resolved', 'wont_fix')),
        priority TEXT DEFAULT 'medium' CHECK(priority IN ('low', 'medium', 'high', 'critical')),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        resolved_at TIMESTAMPTZ
      );
    `);

    // Suggestions table (community feature voting)
    await client.query(`
      CREATE TABLE IF NOT EXISTS suggestions (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        user_id TEXT NOT NULL REFERENCES users(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        status TEXT DEFAULT 'pending_moderation' CHECK(status IN ('pending_moderation', 'approved', 'under_review', 'planned', 'in_progress', 'shipped', 'declined')),
        vote_count INTEGER DEFAULT 0,
        city_id TEXT,
        flagged_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `);

    // Suggestion votes table
    await client.query(`
      CREATE TABLE IF NOT EXISTS suggestion_votes (
        id TEXT PRIMARY KEY DEFAULT uuid_generate_v4()::text,
        suggestion_id TEXT NOT NULL REFERENCES suggestions(id) ON DELETE CASCADE,
        user_id TEXT NOT NULL REFERENCES users(id),
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(suggestion_id, user_id)
      );
    `);

    // Indexes for new tables
    await client.query('CREATE INDEX IF NOT EXISTS idx_photos_user ON photos(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_photos_context ON photos(context, context_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_photo_watermarks_user ON photo_watermarks(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_photo_watermarks_photo ON photo_watermarks(photo_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_removal_requests_case ON removal_requests(case_number)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_removal_requests_status ON removal_requests(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_removal_requests_email ON removal_requests(requester_email)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_user_strikes_user ON user_strikes(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_user ON bug_reports(user_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_status ON bug_reports(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_category ON bug_reports(category)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_bug_reports_created ON bug_reports(created_at DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_suggestions_status ON suggestions(status)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_suggestions_votes ON suggestions(vote_count DESC)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_suggestion_votes_suggestion ON suggestion_votes(suggestion_id)');
    await client.query('CREATE INDEX IF NOT EXISTS idx_suggestion_votes_user ON suggestion_votes(user_id)');

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
