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

        return res.status(200).json({ message: 'Migration complete' });
    } catch (error) {
        console.error('Migration error:', error);
        return res.status(500).json({ error: 'Migration failed', details: error.message });
    }
};
