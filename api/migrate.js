const { sql } = require('@vercel/postgres');
const bcrypt = require('bcryptjs');

module.exports = async function handler(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') return res.status(200).end();

    const secret = req.headers['x-migrate-secret'] || req.query.secret;
    if (secret !== process.env.MIGRATE_SECRET) {
        return res.status(403).json({ error: 'Forbidden' });
    }

    try {
        // Create tables
        await sql`CREATE TABLE IF NOT EXISTS users (
            id SERIAL PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            display_name VARCHAR(100) NOT NULL,
            role VARCHAR(20) DEFAULT 'member',
            city VARCHAR(100),
            bio TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS posts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(255) NOT NULL,
            body TEXT NOT NULL,
            category VARCHAR(50) DEFAULT 'general',
            city VARCHAR(100),
            likes INTEGER DEFAULT 0,
            feed VARCHAR(50) DEFAULT 'safety',
            image_url TEXT,
            image_expires_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS replies (
            id SERIAL PRIMARY KEY,
            post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
            user_id INTEGER REFERENCES users(id),
            body TEXT NOT NULL,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS alerts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            title VARCHAR(255) NOT NULL,
            description TEXT,
            type VARCHAR(50) DEFAULT 'general',
            severity VARCHAR(20) DEFAULT 'low',
            city VARCHAR(100),
            lat DECIMAL(10,7),
            lng DECIMAL(10,7),
            active BOOLEAN DEFAULT true,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS city_votes (
            id SERIAL PRIMARY KEY,
            city VARCHAR(100) UNIQUE NOT NULL,
            state VARCHAR(50),
            votes INTEGER DEFAULT 0
        )`;

        await sql`CREATE TABLE IF NOT EXISTS user_city_votes (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id),
            city_vote_id INTEGER REFERENCES city_votes(id),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // Add new columns if they don't exist (safe for existing databases)
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS feed VARCHAR(50) DEFAULT 'safety'`; } catch(e) {}
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT`; } catch(e) {}
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_expires_at TIMESTAMP`; } catch(e) {}

        // Avatar columns on users table
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) DEFAULT 'initial'`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#E8A0B5'`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_initial VARCHAR(5)`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_display_name VARCHAR(100)`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'`; } catch(e) {}

        // Name Watch tables (Pro feature)
        await sql`CREATE TABLE IF NOT EXISTS watched_names (
            id SERIAL PRIMARY KEY,
            user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
            display_name VARCHAR(200) NOT NULL,
            search_terms TEXT[] NOT NULL DEFAULT '{}',
            match_count INTEGER DEFAULT 0,
            last_match_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        await sql`CREATE TABLE IF NOT EXISTS name_watch_matches (
            id SERIAL PRIMARY KEY,
            watched_name_id INTEGER NOT NULL REFERENCES watched_names(id) ON DELETE CASCADE,
            post_id INTEGER NOT NULL REFERENCES posts(id) ON DELETE CASCADE,
            match_type VARCHAR(20) NOT NULL,
            matched_term VARCHAR(200) NOT NULL,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(watched_name_id, post_id)
        )`;

        try { await sql`CREATE INDEX IF NOT EXISTS idx_watched_names_user ON watched_names(user_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_nwm_watched ON name_watch_matches(watched_name_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_nwm_post ON name_watch_matches(post_id)`; } catch(e) {}

        // ============================================================
        // PHONE AUTH + VERIFICATION TABLES (v2 migration)
        // ============================================================

        // Phone verification OTPs
        await sql`CREATE TABLE IF NOT EXISTS phone_verifications (
            id SERIAL PRIMARY KEY,
            phone VARCHAR(20) NOT NULL,
            code VARCHAR(6) NOT NULL,
            attempts INTEGER DEFAULT 0,
            used BOOLEAN DEFAULT false,
            expires_at TIMESTAMP NOT NULL,
            verified_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // Verification attempt audit log (no PII — only booleans + provider)
        await sql`CREATE TABLE IF NOT EXISTS verification_attempts (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            type VARCHAR(20) NOT NULL,
            result VARCHAR(20) NOT NULL,
            provider VARCHAR(50),
            session_id VARCHAR(255),
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // Community gender fraud reports
        await sql`CREATE TABLE IF NOT EXISTS gender_reports (
            id SERIAL PRIMARY KEY,
            reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reason TEXT NOT NULL,
            reviewed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(reporter_id, reported_user_id)
        )`;

        // User columns for phone auth + verification
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_verified BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_report_count INTEGER DEFAULT 0`; } catch(e) {}

        // Indexes for phone auth
        try { await sql`CREATE INDEX IF NOT EXISTS idx_phone_verifications_phone ON phone_verifications(phone)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_phone_verifications_expires ON phone_verifications(expires_at)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_verification_attempts_user ON verification_attempts(user_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_gender_reports_reported ON gender_reports(reported_user_id)`; } catch(e) {}
        try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone ON users(phone) WHERE phone IS NOT NULL`; } catch(e) {}

        // Make email nullable for phone-only users
        try { await sql`ALTER TABLE users ALTER COLUMN email DROP NOT NULL`; } catch(e) {}

        // ============================================================
        // MESSAGES TABLE (v3 migration — inbox / DM system)
        // ============================================================
        await sql`CREATE TABLE IF NOT EXISTS messages (
            id SERIAL PRIMARY KEY,
            sender_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            recipient_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            content TEXT NOT NULL,
            is_read BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW()
        )`;
        try { await sql`CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_messages_recipient ON messages(recipient_id)`; } catch(e) {}

        // ============================================================
        // POST MODERATION + SAFETY TABLES (v4 migration)
        // ============================================================

        // Post reports
        await sql`CREATE TABLE IF NOT EXISTS post_reports (
            id SERIAL PRIMARY KEY,
            reporter_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
            reported_user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reason VARCHAR(50) NOT NULL,
            details TEXT,
            reviewed BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(reporter_id, post_id)
        )`;

        // Removal requests (photo/content takedown)
        await sql`CREATE TABLE IF NOT EXISTS removal_requests (
            id SERIAL PRIMARY KEY,
            requester_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
            post_author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            reason VARCHAR(50) NOT NULL,
            details TEXT,
            status VARCHAR(20) DEFAULT 'pending',
            reviewed_by INTEGER REFERENCES users(id),
            reviewed_at TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // Ban log (admin audit trail)
        await sql`CREATE TABLE IF NOT EXISTS ban_log (
            id SERIAL PRIMARY KEY,
            admin_id INTEGER REFERENCES users(id),
            banned_user_id INTEGER REFERENCES users(id),
            reason TEXT NOT NULL,
            ban_type VARCHAR(20) DEFAULT 'permanent',
            ban_until TIMESTAMP,
            created_at TIMESTAMP DEFAULT NOW()
        )`;

        // User columns for moderation
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20)`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP`; } catch(e) {}
        try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false`; } catch(e) {}

        // Post columns for moderation
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP`; } catch(e) {}

        // Curated content flag — distinguishes SafeTea-seeded posts from real user posts.
        // Front-end shows a "Curated by SafeTea" badge when true. Required for honest cold-start
        // seeding (Option B in marketing plan): we seed posts to set conversational tone, but
        // never present them as posts from real community members.
        try { await sql`ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_curated BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_posts_is_curated ON posts(is_curated) WHERE is_curated = true`; } catch(e) {}

        // Backfill: any existing post authored by a seed account is curated.
        try { await sql`UPDATE posts SET is_curated = true WHERE is_curated = false AND user_id IN (SELECT id FROM users WHERE email LIKE '%@seed.safetea.local')`; } catch(e) {}

        // Backfill: rename all seed accounts to a single curator persona for the front-end.
        // The accounts themselves remain separate rows (preserves FK history), but they share a
        // public display name so the feed reads as one transparent curator instead of 12 fake users.
        try { await sql`UPDATE users SET display_name = 'SafeTea Stories', avatar_color = '#E8A0B5', avatar_initial = 'S' WHERE email LIKE '%@seed.safetea.local'`; } catch(e) {}

        // Sticky graduation flag for the seed taper. Once a city's organic activity crosses the
        // taper threshold, the daily seeder flips this true so we never restart curation if
        // activity dips below the threshold later. Manual reset: UPDATE cities SET is_graduated=false.
        try { await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_graduated BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE cities ADD COLUMN IF NOT EXISTS graduated_at TIMESTAMP`; } catch(e) {}

        // Scheduled email queue. Used by the activation sequence (D+1, D+3, D+7, D+14)
        // and the iOS waitlist nurture. Cron at /api/cron/send-scheduled-emails picks up
        // rows where scheduled_for <= NOW() and sent_at IS NULL.
        await sql`CREATE TABLE IF NOT EXISTS scheduled_emails (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            email_type VARCHAR(64) NOT NULL,
            scheduled_for TIMESTAMP NOT NULL,
            sent_at TIMESTAMP,
            skipped_reason VARCHAR(64),
            created_at TIMESTAMP DEFAULT NOW()
        )`;
        try { await sql`CREATE INDEX IF NOT EXISTS idx_scheduled_emails_due ON scheduled_emails(scheduled_for) WHERE sent_at IS NULL AND skipped_reason IS NULL`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_scheduled_emails_user ON scheduled_emails(user_id, email_type)`; } catch(e) {}

        // Brand-mention log. Used by /api/cron/monitor-brand-mentions to deduplicate items
        // we've already surfaced to admins, so the daily digest never repeats a thread.
        await sql`CREATE TABLE IF NOT EXISTS brand_mentions (
            id SERIAL PRIMARY KEY,
            source VARCHAR(32) NOT NULL,
            external_id VARCHAR(256) NOT NULL,
            url TEXT NOT NULL,
            title TEXT,
            snippet TEXT,
            posted_at TIMESTAMP,
            seen_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(source, external_id)
        )`;
        try { await sql`CREATE INDEX IF NOT EXISTS idx_brand_mentions_seen ON brand_mentions(seen_at DESC)`; } catch(e) {}

        // Indexes for moderation
        try { await sql`CREATE INDEX IF NOT EXISTS idx_post_reports_post ON post_reports(post_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_post_reports_user ON post_reports(reported_user_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_removal_requests_post ON removal_requests(post_id)`; } catch(e) {}
        try { await sql`CREATE INDEX IF NOT EXISTS idx_ban_log_user ON ban_log(banned_user_id)`; } catch(e) {}

        // ============================================================
        // PHOTO REMOVAL REQUEST - PUBLIC ENDPOINT COLUMNS (v5 migration)
        // ============================================================
        try { await sql`ALTER TABLE removal_requests ADD COLUMN IF NOT EXISTS reporter_email VARCHAR(255)`; } catch(e) {}
        try { await sql`ALTER TABLE removal_requests ADD COLUMN IF NOT EXISTS leaked_image_hash VARCHAR(64)`; } catch(e) {}
        try { await sql`ALTER TABLE removal_requests ADD COLUMN IF NOT EXISTS watermark_user_id INTEGER`; } catch(e) {}
        try { await sql`ALTER TABLE removal_requests ADD COLUMN IF NOT EXISTS auto_action_taken VARCHAR(50)`; } catch(e) {}

        // Make requester_id and post_id nullable for public (unauthenticated) requests
        try { await sql`ALTER TABLE removal_requests ALTER COLUMN requester_id DROP NOT NULL`; } catch(e) {}
        try { await sql`ALTER TABLE removal_requests DROP CONSTRAINT IF EXISTS removal_requests_requester_id_post_id_key`; } catch(e) {}

        // ============================================================
        // SYSTEM MESSAGES + PUSH TOKENS (v6 migration)
        // ============================================================

        // Add system message columns to messages table
        try { await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_system BOOLEAN DEFAULT false`; } catch(e) {}
        try { await sql`ALTER TABLE messages ADD COLUMN IF NOT EXISTS system_type VARCHAR(50)`; } catch(e) {}

        // Push notification tokens table
        await sql`CREATE TABLE IF NOT EXISTS push_tokens (
            id SERIAL PRIMARY KEY,
            user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
            token VARCHAR(255) NOT NULL,
            platform VARCHAR(10) DEFAULT 'ios',
            created_at TIMESTAMP DEFAULT NOW(),
            UNIQUE(user_id, token)
        )`;
        try { await sql`CREATE INDEX IF NOT EXISTS idx_push_tokens_user ON push_tokens(user_id)`; } catch(e) {}

        return res.status(200).json({
            message: 'Migration complete (v6: phone auth + verification + Name Watch + messages + moderation + photo removal + system messages + push tokens)'
        });
    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({ error: 'Migration failed', details: error.message });
    }
};
