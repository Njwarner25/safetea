/**
 * POST /api/ai/journal
 *   Body: { title?, content, mood?, topic?, tags?: string[], is_documentation?, save_to_vault_folder_id? }
 *   Returns: { entry: { id, title, mood, topic, tags, is_documentation, vault_folder_id, created_at } }
 *
 * GET  /api/ai/journal?limit=50&since=ISO
 *   Returns: { entries: [...] }   (most-recent first; content is decrypted)
 *
 * GET  /api/ai/journal?id=123
 *   Returns: { entry: {...} }     (single entry, decrypted)
 *
 * DELETE /api/ai/journal?id=123
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { encrypt, decrypt } = require('../_utils/encrypt');

const MAX_TITLE_LEN = 120;
const MAX_CONTENT_LEN = 50000;
const MAX_TAGS = 8;
const MAX_TAG_LEN = 32;

const VALID_MOODS = new Set(['calm', 'safe', 'anxious', 'scared', 'sad', 'angry', 'numb', 'hopeful', 'overwhelmed', 'okay']);

function sanitizeTags(input) {
    if (!Array.isArray(input)) return [];
    return input
        .map(function (t) { return String(t || '').trim().slice(0, MAX_TAG_LEN); })
        .filter(Boolean)
        .slice(0, MAX_TAGS);
}

function decryptEntry(row) {
    let tags = [];
    if (row.tags_enc) {
        try {
            const raw = decrypt(row.tags_enc);
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) tags = parsed;
        } catch (e) { /* leave empty */ }
    }
    return {
        id: String(row.id),
        title: row.title_enc ? decrypt(row.title_enc) : null,
        content: decrypt(row.content_enc),
        mood: row.mood || null,
        topic: row.topic || null,
        tags: tags,
        is_documentation: !!row.is_documentation,
        vault_folder_id: row.vault_folder_id || null,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    try {
        if (req.method === 'POST') return handleCreate(req, res, user);
        if (req.method === 'GET') {
            if (req.query && req.query.id) return handleGetOne(req, res, user);
            return handleList(req, res, user);
        }
        if (req.method === 'DELETE') return handleDelete(req, res, user);
        return res.status(405).json({ error: 'Method not allowed' });
    } catch (err) {
        console.error('[ai/journal]', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

async function handleCreate(req, res, user) {
    const body = await parseBody(req);
    const content = String(body.content || '').trim().slice(0, MAX_CONTENT_LEN);
    if (!content) return res.status(400).json({ error: 'content required' });

    const title = body.title ? String(body.title).trim().slice(0, MAX_TITLE_LEN) : null;
    const mood  = VALID_MOODS.has(body.mood) ? body.mood : null;
    const topic = body.topic ? String(body.topic).trim().slice(0, 64) : null;
    const tags  = sanitizeTags(body.tags);
    const isDocumentation = !!body.is_documentation;
    const vaultFolderId = body.save_to_vault_folder_id ? parseInt(body.save_to_vault_folder_id, 10) : null;

    // If user wants to save to vault, verify they own the folder.
    if (vaultFolderId) {
        const folder = await getOne(
            `SELECT id FROM vault_folders WHERE id = $1 AND owner_user_id = $2`,
            [vaultFolderId, user.id]
        );
        if (!folder) return res.status(404).json({ error: 'Vault folder not found' });
    }

    const inserted = await getOne(
        `INSERT INTO ai_journal_entries
            (user_id, title_enc, content_enc, mood, topic, tags_enc, is_documentation, vault_folder_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
         RETURNING id, title_enc, content_enc, mood, topic, tags_enc, is_documentation, vault_folder_id, created_at, updated_at`,
        [
            user.id,
            title ? encrypt(title) : null,
            encrypt(content),
            mood,
            topic,
            tags.length ? encrypt(JSON.stringify(tags)) : null,
            isDocumentation,
            vaultFolderId,
        ]
    );

    return res.status(201).json({ entry: decryptEntry(inserted) });
}

async function handleList(req, res, user) {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const since = req.query.since ? new Date(req.query.since) : null;

    let rows;
    if (since && !isNaN(since.getTime())) {
        rows = await getMany(
            `SELECT id, title_enc, content_enc, mood, topic, tags_enc, is_documentation, vault_folder_id, created_at, updated_at
             FROM ai_journal_entries
             WHERE user_id = $1 AND created_at >= $2
             ORDER BY created_at DESC LIMIT $3`,
            [user.id, since, limit]
        );
    } else {
        rows = await getMany(
            `SELECT id, title_enc, content_enc, mood, topic, tags_enc, is_documentation, vault_folder_id, created_at, updated_at
             FROM ai_journal_entries
             WHERE user_id = $1
             ORDER BY created_at DESC LIMIT $2`,
            [user.id, limit]
        );
    }

    return res.status(200).json({ entries: rows.map(decryptEntry) });
}

async function handleGetOne(req, res, user) {
    const id = parseInt(req.query.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id required' });
    const row = await getOne(
        `SELECT id, title_enc, content_enc, mood, topic, tags_enc, is_documentation, vault_folder_id, created_at, updated_at
         FROM ai_journal_entries WHERE id = $1 AND user_id = $2`,
        [id, user.id]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ entry: decryptEntry(row) });
}

async function handleDelete(req, res, user) {
    const id = parseInt(req.query.id, 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'id required' });
    const result = await run(
        `DELETE FROM ai_journal_entries WHERE id = $1 AND user_id = $2`,
        [id, user.id]
    );
    if (!result.rowCount) return res.status(404).json({ error: 'Not found' });
    return res.status(200).json({ success: true });
}
