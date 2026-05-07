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

    if (!isCronRun) {
        const user = await authenticate(req);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
    }

    try {
        // ai_companion_settings — one row per user, customization choices.
        await run(`
            CREATE TABLE IF NOT EXISTS ai_companion_settings (
                user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
                companion_name VARCHAR(40) NOT NULL,
                avatar_style VARCHAR(32) NOT NULL DEFAULT 'soft_guardian',
                theme_color VARCHAR(32) NOT NULL DEFAULT 'safetea_coral',
                tone VARCHAR(16) NOT NULL DEFAULT 'gentle',
                onboarded_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // ai_chat_messages — encrypted-at-rest chat history per user.
        // No folder_id (unlike vault assistant) — Companion is profile-scoped.
        await run(`
            CREATE TABLE IF NOT EXISTS ai_chat_messages (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                role VARCHAR(16) NOT NULL CHECK (role IN ('user','assistant','system')),
                content_enc TEXT NOT NULL,
                token_count INTEGER,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_ai_chat_user_created ON ai_chat_messages(user_id, created_at DESC)`);

        // ai_journal_entries — user-authored journal, encrypted, optional vault link.
        await run(`
            CREATE TABLE IF NOT EXISTS ai_journal_entries (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                title_enc TEXT,
                content_enc TEXT NOT NULL,
                mood VARCHAR(32),
                topic VARCHAR(64),
                tags_enc TEXT,
                is_documentation BOOLEAN NOT NULL DEFAULT FALSE,
                vault_folder_id INTEGER,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);
        await run(`CREATE INDEX IF NOT EXISTS idx_ai_journal_user_created ON ai_journal_entries(user_id, created_at DESC)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_ai_journal_documentation ON ai_journal_entries(user_id, is_documentation) WHERE is_documentation = TRUE`);

        console.log('AI Companion migration completed successfully');
        return res.status(200).json({
            success: true,
            tables_created: ['ai_companion_settings', 'ai_chat_messages', 'ai_journal_entries']
        });
    } catch (error) {
        console.error('AI Companion migration error:', error);
        return res.status(500).json({ error: 'Migration failed: ' + error.message });
    }
};
