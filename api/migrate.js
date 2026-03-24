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

        return res.status(200).json({ message: 'Migration complete (including Name Watch tables)' });
    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({ error: 'Migration failed', details: error.message });
    }
};
