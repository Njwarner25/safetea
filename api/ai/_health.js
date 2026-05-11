/**
 * GET /api/ai/_health
 *
 * Admin-only (or x-cron-secret) health/diagnostic probe for the AI Companion
 * stack. Reports whether the OpenAI key is configured, which source variable
 * it came from, the key's safe-prefix only (NEVER the value), and whether
 * the three required tables exist.
 *
 * Use to debug "Alessia is not online" issues without leaking secrets.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne } = require('../_utils/db');
const companion = require('../../services/ai/companion');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

    // Allow CRON_SECRET header for non-interactive runs.
    const cronSecret = req.headers['x-cron-secret'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const isCronRun = !!cronSecret && cronSecret === process.env.CRON_SECRET;
    if (!isCronRun) {
        const user = await authenticate(req);
        if (!user || user.role !== 'admin') {
            return res.status(403).json({ error: 'Admin access required' });
        }
    }

    const aiKey = process.env.AI_COMPANION_OPENAI_KEY || '';
    const vaultKey = process.env.VAULT_ASSISTANT_OPENAI_KEY || '';
    const activeKey = aiKey || vaultKey;
    const keySource = aiKey ? 'AI_COMPANION_OPENAI_KEY' : (vaultKey ? 'VAULT_ASSISTANT_OPENAI_KEY' : null);

    const safePrefix = activeKey
        ? (activeKey.length > 12 ? activeKey.slice(0, 8) + '…' + activeKey.slice(-4) : 'set (short)')
        : null;

    // Check the three required tables. getOne returns null/undefined if the
    // table doesn't exist (the underlying _utils/db swallows the error), so
    // wrap each in its own try.
    async function tableExists(name) {
        try {
            const row = await getOne(
                `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = $1) AS exists`,
                [name]
            );
            return !!(row && row.exists);
        } catch (e) { return false; }
    }

    const [t1, t2, t3] = await Promise.all([
        tableExists('ai_companion_settings'),
        tableExists('ai_chat_messages'),
        tableExists('ai_journal_entries'),
    ]);

    const allTablesExist = t1 && t2 && t3;

    return res.status(200).json({
        ok: !!activeKey && allTablesExist,
        openai_key_set: !!activeKey,
        openai_key_source: keySource,
        openai_key_prefix: safePrefix,
        model: process.env.AI_COMPANION_MODEL || 'gpt-4o-mini',
        companion_isEnabled: companion.isEnabled(),
        tables: {
            ai_companion_settings: t1,
            ai_chat_messages: t2,
            ai_journal_entries: t3,
        },
        migration_endpoint: '/api/migrate-ai-companion',
        notes: allTablesExist ? 'Schema OK.' : 'Run /api/migrate-ai-companion (admin auth) to create the missing tables.',
    });
};
