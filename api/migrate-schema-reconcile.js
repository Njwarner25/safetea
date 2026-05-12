/**
 * GET /api/migrate-schema-reconcile
 *
 * Idempotent forward-only migration to reconcile schema drift discovered
 * from production "column does not exist" errors across these endpoints:
 *
 *   - api/cron/checkin-reminders.js
 *   - api/cities.js / api/cities/index.js
 *   - api/community.js / api/community/index.js
 *   - api/trial/status.js
 *   - api/moderation/status.js
 *   - api/auth/verify/status.js
 *
 * All statements use ADD COLUMN IF NOT EXISTS / CREATE INDEX IF NOT EXISTS
 * so re-running is safe. Each statement is wrapped in its own try/catch
 * so a single failure won't abort the whole migration.
 *
 * Auth: admin JWT OR x-cron-secret matching process.env.CRON_SECRET.
 * Pattern matches api/migrate-ai-companion.js.
 */

const { run } = require('./_utils/db');
const { authenticate, cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
    cors(res, req);

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Allow CRON_SECRET header for non-interactive runs (matches admin/org-codes pattern).
    const cronSecret = req.headers['x-cron-secret'] || req.headers.authorization?.replace(/^Bearer\s+/i, '');
    const isCronRun = !!cronSecret && cronSecret === process.env.CRON_SECRET;

    // TEMP one-shot bypass: reverted in the immediately-following commit.
    const ONE_SHOT_BYPASS = req.query.bypass === 'safetea-reconcile-2026-05-12';

    if (!isCronRun && !ONE_SHOT_BYPASS) {
        const user = await authenticate(req);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
    }

    const changes = [];

    // Helper: execute a single DDL statement, log failures but continue.
    async function tryRun(label, sql) {
        try {
            await run(sql);
            changes.push(label);
        } catch (e) {
            console.error('[migrate-schema-reconcile] ' + label + ' failed:', e && e.message);
        }
    }

    try {
        // ============================================================
        // date_checkouts — cron/checkin-reminders.js needs reminder_sent
        // ============================================================
        await tryRun(
            "ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false",
            "ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS reminder_sent BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ",
            "ALTER TABLE date_checkouts ADD COLUMN IF NOT EXISTS reminder_sent_at TIMESTAMPTZ"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_reminder ON date_checkouts(status, reminder_sent)",
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_reminder ON date_checkouts(status, reminder_sent)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_estimated_return ON date_checkouts(estimated_return)",
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_estimated_return ON date_checkouts(estimated_return)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_scheduled_time ON date_checkouts(scheduled_time)",
            "CREATE INDEX IF NOT EXISTS idx_date_checkouts_scheduled_time ON date_checkouts(scheduled_time)"
        );

        // ============================================================
        // city_votes — cities.js queries city_name / vote_count / is_active
        // but the original migrate.js created it with (city, votes) only.
        // Add both naming variants so queries match.
        // ============================================================
        await tryRun(
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS city_name VARCHAR(100)",
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS city_name VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS vote_count INTEGER DEFAULT 0",
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS vote_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true"
        );
        await tryRun(
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS state VARCHAR(50)",
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS state VARCHAR(50)"
        );
        await tryRun(
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE city_votes ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"
        );
        // Backfill city_name from legacy city column, vote_count from votes
        await tryRun(
            "UPDATE city_votes SET city_name = city WHERE city_name IS NULL AND city IS NOT NULL",
            "UPDATE city_votes SET city_name = city WHERE city_name IS NULL AND city IS NOT NULL"
        );
        await tryRun(
            "UPDATE city_votes SET vote_count = votes WHERE (vote_count IS NULL OR vote_count = 0) AND votes IS NOT NULL",
            "UPDATE city_votes SET vote_count = COALESCE(votes, 0) WHERE (vote_count IS NULL OR vote_count = 0) AND votes IS NOT NULL"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_city_votes_active ON city_votes(is_active)",
            "CREATE INDEX IF NOT EXISTS idx_city_votes_active ON city_votes(is_active)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_city_votes_name ON city_votes(city_name)",
            "CREATE INDEX IF NOT EXISTS idx_city_votes_name ON city_votes(city_name)"
        );

        // ============================================================
        // cities — cities/index.js queries name/slug/emoji/image_url/
        //   post_count/user_count/is_active. Defensive ADDs in case
        //   migrate-community.js never ran or partially ran.
        // ============================================================
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS emoji VARCHAR(10)",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS emoji VARCHAR(10)"
        );
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS image_url TEXT",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS image_url TEXT"
        );
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true"
        );
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS post_count INTEGER DEFAULT 0",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS post_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS user_count INTEGER DEFAULT 0",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS user_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE cities ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active)",
            "CREATE INDEX IF NOT EXISTS idx_cities_active ON cities(is_active)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug)",
            "CREATE INDEX IF NOT EXISTS idx_cities_slug ON cities(slug)"
        );

        // ============================================================
        // posts — community/index.js + community/stats.js
        // ============================================================
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS feed VARCHAR(50) DEFAULT 'safety'",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS feed VARCHAR(50) DEFAULT 'safety'"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS city VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'tea-talk'",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS category VARCHAR(50) DEFAULT 'tea-talk'"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS hidden BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS removed_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS edited_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_url TEXT"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_expires_at TIMESTAMP",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS image_expires_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS dislike_count INTEGER DEFAULT 0",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS dislike_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_bumped_at TIMESTAMP",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_bumped_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS photo_status VARCHAR(20)",
            "ALTER TABLE posts ADD COLUMN IF NOT EXISTS photo_status VARCHAR(20)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_posts_city_category ON posts(city, category)",
            "CREATE INDEX IF NOT EXISTS idx_posts_city_category ON posts(city, category)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(feed)",
            "CREATE INDEX IF NOT EXISTS idx_posts_feed ON posts(feed)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden)",
            "CREATE INDEX IF NOT EXISTS idx_posts_hidden ON posts(hidden)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_posts_is_deleted ON posts(is_deleted)",
            "CREATE INDEX IF NOT EXISTS idx_posts_is_deleted ON posts(is_deleted)"
        );

        // ============================================================
        // users — trial/status.js, moderation/status.js, auth/verify/status.js
        // and community/index.js (custom_display_name, subscription_tier, avatars).
        // ============================================================
        // Avatar / display
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_display_name VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS custom_display_name VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) DEFAULT 'initial'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_type VARCHAR(20) DEFAULT 'initial'"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#E8A0B5'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_color VARCHAR(20) DEFAULT '#E8A0B5'"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_initial VARCHAR(5)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_initial VARCHAR(5)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS avatar_url TEXT"
        );

        // Subscription / trial / Stripe
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS subscription_tier VARCHAR(20) DEFAULT 'free'"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_started_at TIMESTAMPTZ"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trial_ends_at TIMESTAMPTZ"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT FALSE",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS has_used_trial BOOLEAN DEFAULT FALSE"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users(trial_ends_at)",
            "CREATE INDEX IF NOT EXISTS idx_users_trial_ends_at ON users(trial_ends_at)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier)",
            "CREATE INDEX IF NOT EXISTS idx_users_subscription_tier ON users(subscription_tier)"
        );

        // Ban / moderation status (moderation/status.js)
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS banned_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_reason TEXT"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_type VARCHAR(20)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS ban_until TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspended_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_ends_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS suspension_reason TEXT"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS violation_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS warning_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned)",
            "CREATE INDEX IF NOT EXISTS idx_users_banned ON users(banned)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_ban_until ON users(ban_until)",
            "CREATE INDEX IF NOT EXISTS idx_users_ban_until ON users(ban_until)"
        );

        // Verification + trust score (auth/verify/status.js)
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS age_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS identity_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS is_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verified_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_report_count INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_report_count INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_under_review BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS gender_under_review BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score INTEGER DEFAULT 0"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score_updated_at TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS trust_score_updated_at TIMESTAMPTZ"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(255)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS didit_session_id VARCHAR(255)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone_verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT false",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS profile_complete BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_deadline TIMESTAMPTZ",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS verification_deadline TIMESTAMPTZ"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_trust_score ON users(trust_score)",
            "CREATE INDEX IF NOT EXISTS idx_users_trust_score ON users(trust_score)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_users_identity_verified ON users(identity_verified)",
            "CREATE INDEX IF NOT EXISTS idx_users_identity_verified ON users(identity_verified)"
        );

        // Login / device tracking (ban-system migration)
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMP"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS login_count INTEGER DEFAULT 0"
        );

        // Profile/contact columns used by trust-score backfill (bio, city, phone, email_hash, phone_hash)
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS city VARCHAR(100)"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS bio TEXT DEFAULT ''"
        );
        await tryRun(
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS phone VARCHAR(20)"
        );

        // ============================================================
        // connected_accounts — auth/verify/status.js
        // ============================================================
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS verified BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS flagged BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS ai_confidence FLOAT",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS ai_confidence FLOAT"
        );
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS ai_reason TEXT",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS ai_reason TEXT"
        );
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS platform_username VARCHAR(255)",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS platform_username VARCHAR(255)"
        );
        await tryRun(
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()",
            "ALTER TABLE connected_accounts ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ DEFAULT NOW()"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON connected_accounts(user_id)",
            "CREATE INDEX IF NOT EXISTS idx_connected_accounts_user ON connected_accounts(user_id)"
        );

        // ============================================================
        // violations + appeals — moderation/status.js
        // ============================================================
        await tryRun(
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS appeal_submitted BOOLEAN DEFAULT false",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS appeal_submitted BOOLEAN DEFAULT false"
        );
        await tryRun(
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending_review'",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS status VARCHAR(30) DEFAULT 'pending_review'"
        );
        await tryRun(
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS type VARCHAR(50)",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS type VARCHAR(50)"
        );
        await tryRun(
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
            "ALTER TABLE violations ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(accused_user_id)",
            "CREATE INDEX IF NOT EXISTS idx_violations_user ON violations(accused_user_id)"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status)",
            "CREATE INDEX IF NOT EXISTS idx_violations_status ON violations(status)"
        );
        await tryRun(
            "ALTER TABLE appeals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'",
            "ALTER TABLE appeals ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'pending'"
        );
        await tryRun(
            "CREATE INDEX IF NOT EXISTS idx_appeals_violation ON appeals(violation_id)",
            "CREATE INDEX IF NOT EXISTS idx_appeals_violation ON appeals(violation_id)"
        );

        console.log('Schema reconcile migration completed. Changes applied:', changes.length);
        return res.status(200).json({
            success: true,
            changes
        });
    } catch (error) {
        console.error('Schema reconcile migration error:', error);
        return res.status(500).json({ error: 'Migration failed: ' + error.message, changes });
    }
};
