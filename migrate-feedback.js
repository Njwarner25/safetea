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

    // Admin-only migration
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') {
        return res.status(403).json({ error: 'Admin access required' });
    }

    try {
        // Create user_feedback table
        await run(`
            CREATE TABLE IF NOT EXISTS user_feedback (
                id SERIAL PRIMARY KEY,
                user_id INTEGER NOT NULL REFERENCES users(id),
                message TEXT NOT NULL,
                status VARCHAR(20) NOT NULL DEFAULT 'new',
                admin_notes TEXT,
                created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
            )
        `);

        // Add indexes
        await run(`CREATE INDEX IF NOT EXISTS idx_feedback_user ON user_feedback(user_id)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_feedback_status ON user_feedback(status)`);
        await run(`CREATE INDEX IF NOT EXISTS idx_feedback_created ON user_feedback(created_at DESC)`);

        console.log('Feedback migration completed successfully');
        return res.status(200).json({ success: true, message: 'user_feedback table created' });
    } catch (error) {
        console.error('Feedback migration error:', error);
        return res.status(500).json({ error: 'Migration failed: ' + error.message });
    }
};
