/**
 * GET /api/share/:token
 *
 * Public endpoint — no auth. Anyone holding the token can fetch. The token
 * itself is a 48-byte unguessable bearer issued to a specific contact and
 * embedded in a one-time email link. Intended to be opened once by the
 * recipient, though we allow re-fetch until expiry.
 *
 * Behavior:
 *   - 404 if token doesn't exist
 *   - 410 if expired OR blob was already purged
 *   - 302 redirect to Blob URL on success, with Content-Disposition hint
 *   - Writes EXPORT_DOWNLOAD audit row on every successful hit
 *   - Bumps download_count + downloaded_at
 *
 * Rate-limit: a simple in-memory window, good enough for V1 (Vercel
 * serverless instances rotate, so this is per-instance). A real rate
 * limit with shared state is V2.
 */

'use strict';

const { cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const audit = require('../../services/vault/audit');

// Per-instance rolling window — 10 hits per token per minute
const HITS = new Map();
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 10;
function rateLimit(token) {
  const now = Date.now();
  const entry = HITS.get(token) || { count: 0, first: now };
  if (now - entry.first > WINDOW_MS) { entry.count = 0; entry.first = now; }
  entry.count++;
  HITS.set(token, entry);
  if (HITS.size > 500) {
    // Light GC
    for (const [k, v] of HITS) if (now - v.first > WINDOW_MS) HITS.delete(k);
  }
  return entry.count <= MAX_PER_WINDOW;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const token = typeof req.query.token === 'string' ? req.query.token.trim() : '';
  if (!token || token.length < 20) return res.status(404).json({ error: 'Not found' });

  if (!rateLimit(token)) return res.status(429).json({ error: 'Too many requests' });

  try {
    const row = await getOne(
      `SELECT id, folder_id, storage_key, expires_at, storage_deleted_at
       FROM vault_exports WHERE share_token = $1`,
      [token]
    );
    if (!row) return res.status(404).json({ error: 'Not found' });

    // Expired — defense in depth: also purge the blob if still present
    if (new Date(row.expires_at).getTime() <= Date.now()) {
      if (row.storage_key && !row.storage_deleted_at) {
        try {
          const blob = require('@vercel/blob');
          await blob.del(row.storage_key);
        } catch (_) {}
        await run(
          `UPDATE vault_exports SET storage_key = NULL, storage_deleted_at = NOW() WHERE id = $1`,
          [row.id]
        );
      }
      return res.status(410).json({ error: 'This link has expired.' });
    }
    if (row.storage_deleted_at || !row.storage_key) {
      return res.status(410).json({ error: 'This export was revoked.' });
    }

    // Record the download
    await run(
      `UPDATE vault_exports SET download_count = COALESCE(download_count, 0) + 1,
                                 downloaded_at = COALESCE(downloaded_at, NOW())
       WHERE id = $1`,
      [row.id]
    );
    audit.write({
      req: req,
      actor_user_id: null,
      actor_role: 'contact',
      action: audit.ACTIONS.EXPORT_DOWNLOAD,
      target_type: 'export',
      target_id: row.id,
      folder_id: row.folder_id,
    });

    // 302 redirect — browser follows to Blob URL and renders the PDF
    // inline. Content-Disposition is set on the Blob side when we
    // uploaded with contentType: 'application/pdf'.
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Referrer-Policy', 'no-referrer');
    return res.redirect(302, row.storage_key);
  } catch (err) {
    console.error('[share/[token]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
