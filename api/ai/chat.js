/**
 * POST /api/ai/chat
 *   Body: { message }
 *   Returns: { reply, message_id }
 *
 * GET  /api/ai/chat?limit=50
 *   Returns: { messages: [{ id, role, content, created_at }] }
 *
 * Encrypts both sides of the conversation at rest. Pulls the last
 * MAX_HISTORY_MESSAGES rows for context. Companion settings (name + tone)
 * are read from ai_companion_settings.
 *
 * NOTE: Operator/practitioner override on record (2026-05-05). The
 * vault assistant is gated behind VAULT_ASSISTANT_ENABLED + practitioner
 * review; this Companion endpoint ships without that gate at user
 * direction. The OpenAI key (`AI_COMPANION_OPENAI_KEY` or fallback to
 * `VAULT_ASSISTANT_OPENAI_KEY`) is the only required env. If unset, the
 * endpoint returns 503 so the mobile app can hide the chat input.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { encrypt, decrypt } = require('../_utils/encrypt');
const companion = require('../../services/ai/companion');

const MAX_MESSAGE_LEN = 4000;
const MAX_HISTORY_RETURN = 50;
const MAX_HISTORY_FOR_CONTEXT = 20;

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    if (!companion.isEnabled()) {
        return res.status(503).json({ error: 'AI Companion is not configured' });
    }

    try {
        if (req.method === 'GET') return handleHistory(req, res, user);
        if (req.method === 'POST') return handleChat(req, res, user);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[ai/chat]', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

async function handleHistory(req, res, user) {
    const limit = Math.min(parseInt(req.query.limit, 10) || MAX_HISTORY_RETURN, MAX_HISTORY_RETURN);
    const rows = await getMany(
        `SELECT id, role, content_enc, created_at
         FROM ai_chat_messages
         WHERE user_id = $1
         ORDER BY created_at DESC
         LIMIT $2`,
        [user.id, limit]
    );
    const messages = rows.map(function (r) {
        return {
            id: String(r.id),
            role: r.role,
            content: decrypt(r.content_enc),
            created_at: r.created_at,
        };
    }).reverse();
    return res.status(200).json({ messages });
}

async function handleChat(req, res, user) {
    const body = await parseBody(req);
    const message = String(body.message || '').trim().slice(0, MAX_MESSAGE_LEN);
    if (!message) return res.status(400).json({ error: 'message required' });

    const settings = await getOne(
        `SELECT companion_name, tone FROM ai_companion_settings WHERE user_id = $1`,
        [user.id]
    );
    const companionName = (settings && settings.companion_name) || 'Companion';
    const tone = (settings && settings.tone) || 'gentle';

    // Persist user message first so it survives a model failure.
    const inserted = await getOne(
        `INSERT INTO ai_chat_messages (user_id, role, content_enc)
         VALUES ($1, 'user', $2)
         RETURNING id, created_at`,
        [user.id, encrypt(message)]
    );

    // Build history (decrypt the most recent N for context, ascending).
    const recentRows = await getMany(
        `SELECT role, content_enc FROM ai_chat_messages
         WHERE user_id = $1 AND id < $2
         ORDER BY id DESC LIMIT $3`,
        [user.id, inserted.id, MAX_HISTORY_FOR_CONTEXT]
    );
    const history = recentRows
        .map(function (r) { return { role: r.role, content: decrypt(r.content_enc) }; })
        .reverse();

    let reply;
    let tokens = null;
    try {
        const result = await companion.chat({
            history: history,
            companionName: companionName,
            tone: tone,
            userMessage: message,
        });
        reply = result.reply;
        tokens = result.tokens;
    } catch (err) {
        console.error('[ai/chat] model error', err && err.message);
        return res.status(502).json({ error: 'Companion is unavailable right now. Try again in a moment.' });
    }

    const replyRow = await getOne(
        `INSERT INTO ai_chat_messages (user_id, role, content_enc, token_count)
         VALUES ($1, 'assistant', $2, $3)
         RETURNING id, created_at`,
        [user.id, encrypt(reply), tokens]
    );

    return res.status(200).json({
        reply: reply,
        message_id: String(replyRow.id),
        created_at: replyRow.created_at,
    });
}
