/**
 * GET    /api/vault/entries/:id   — fetch + decrypt a single entry
 * PATCH  /api/vault/entries/:id   — update content / event_at / location / tags
 * DELETE /api/vault/entries/:id   — soft delete (set deleted_at)
 *
 * Ownership check goes via the parent folder — we JOIN vault_folders and
 * confirm owner_user_id = caller on every request. entry_type and folder_id
 * are immutable; use DELETE + re-create to move an entry between folders.
 *
 * Legal hold: entry-level legal_hold OR folder-level legal_hold both block
 * DELETE. PATCH on content still allowed (owner is just adding context to
 * a held record), but PATCH that would transition state (untag/archive) is
 * allowed since it doesn't destroy evidence.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { unwrapFolderKey, encryptField, decryptField } = require('../../../services/vault/encryption');
const audit = require('../../../services/vault/audit');
const H = require('../../../services/vault/entry-helpers');
const { blockIfNotPlus } = require('../../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  const entryId = parseInt(req.query.id, 10);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ error: 'Invalid entry id' });
  }

  try {
    // One query gives us both the entry and the parent folder's DEK. The
    // folder owner check is how we enforce access — no separate ACL.
    const row = await getOne(
      `SELECT e.id, e.folder_id, e.owner_user_id, e.entry_type,
              e.logged_at, e.event_at, e.location_enc, e.content_enc,
              e.ai_status, e.ai_confidence, e.ai_summary_enc, e.ai_dates_enc,
              e.tags, e.legal_hold AS entry_legal_hold,
              e.deleted_at, e.created_at, e.updated_at,
              f.owner_user_id AS folder_owner, f.legal_hold AS folder_legal_hold,
              f.dek_wrapped, f.dek_iv, f.dek_tag
       FROM vault_entries e
       JOIN vault_folders f ON f.id = e.folder_id
       WHERE e.id = $1`,
      [entryId]
    );
    if (!row || row.folder_owner !== user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }

    if (req.method === 'GET') return handleGet(req, res, user, row);
    if (req.method === 'PATCH') return handlePatch(req, res, user, row);
    if (req.method === 'DELETE') return handleDelete(req, res, user, row);
    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/entries/[id]] fatal:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};

// ---------------------------------------------------------------------------

async function handleGet(req, res, user, row) {
  const dek = unwrapFolderKey(row);
  let content, location, ai_summary, ai_dates;
  try {
    content = row.content_enc ? decryptField(dek, row.content_enc) : null;
    location = H.decryptLocation(dek, row.location_enc);
    ai_summary = row.ai_summary_enc ? decryptField(dek, row.ai_summary_enc) : null;
    ai_dates = row.ai_dates_enc ? H.safeJsonParse(decryptField(dek, row.ai_dates_enc)) : null;
  } finally {
    dek.fill(0);
  }

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.ENTRY_VIEW,
    target_type: 'entry',
    target_id: row.id,
    folder_id: row.folder_id,
  });

  return res.status(200).json({
    entry: {
      id: String(row.id),
      folder_id: String(row.folder_id),
      entry_type: row.entry_type,
      content: content,
      location: location,
      event_at: row.event_at,
      logged_at: row.logged_at,
      tags: row.tags || [],
      ai_status: row.ai_status,
      ai_confidence: row.ai_confidence !== null ? Number(row.ai_confidence) : null,
      ai_summary: ai_summary,
      ai_dates: ai_dates,
      legal_hold: !!row.entry_legal_hold,
      deleted: !!row.deleted_at,
      created_at: row.created_at,
      updated_at: row.updated_at,
    },
  });
}

// ---------------------------------------------------------------------------

async function handlePatch(req, res, user, row) {
  if (row.deleted_at) return res.status(410).json({ error: 'Entry has been deleted' });

  const body = (await parseBody(req)) || {};
  const hasContent = typeof body.content === 'string';
  const hasEventAt = Object.prototype.hasOwnProperty.call(body, 'event_at');
  const hasLocation = Object.prototype.hasOwnProperty.call(body, 'location');
  const hasTags = Array.isArray(body.tags);

  if (!hasContent && !hasEventAt && !hasLocation && !hasTags) {
    return res.status(400).json({ error: 'Nothing to update' });
  }

  // Owner cannot toggle legal_hold themselves.
  if (Object.prototype.hasOwnProperty.call(body, 'legal_hold')) {
    return res.status(403).json({ error: 'Legal hold can only be set or released by SafeTea administration.' });
  }

  // Validate
  const newContent = hasContent ? body.content.trim() : null;
  if (hasContent) {
    if (row.entry_type === 'note' && !newContent) {
      return res.status(400).json({ error: 'Content is required for note entries' });
    }
    if (newContent.length > H.MAX_CONTENT_LEN) {
      return res.status(400).json({ error: `Content exceeds ${H.MAX_CONTENT_LEN} characters` });
    }
  }

  let eventAt = null;
  if (hasEventAt) {
    if (body.event_at === null || body.event_at === '') {
      eventAt = null; // explicit clear
    } else {
      eventAt = H.parseOptionalTimestamp(body.event_at);
      if (!eventAt) return res.status(400).json({ error: 'event_at must be an ISO-8601 timestamp or null' });
    }
  }

  let location = null;
  if (hasLocation) {
    location = body.location ? H.sanitizeLocation(body.location) : null;
  }

  let tags = null;
  if (hasTags) {
    tags = H.sanitizeTags(body.tags);
    if (tags === null) {
      return res.status(400).json({ error: `Invalid tags. Max ${H.MAX_TAGS} tags, lowercase alphanumeric + _ -, up to ${H.MAX_TAG_LEN} chars each.` });
    }
  }

  // Re-encrypt if content / location changed.
  let contentEnc = null;
  let locationEnc = null;
  if (hasContent || hasLocation) {
    const dek = unwrapFolderKey(row);
    try {
      if (hasContent) contentEnc = newContent ? encryptField(dek, newContent) : null;
      if (hasLocation) locationEnc = location ? encryptField(dek, JSON.stringify(location)) : null;
    } finally {
      dek.fill(0);
    }
  }

  await run(
    `UPDATE vault_entries SET
       content_enc  = CASE WHEN $2::boolean THEN $3 ELSE content_enc  END,
       event_at     = CASE WHEN $4::boolean THEN $5 ELSE event_at     END,
       location_enc = CASE WHEN $6::boolean THEN $7 ELSE location_enc END,
       tags         = CASE WHEN $8::boolean THEN $9::text[] ELSE tags END,
       updated_at   = NOW()
     WHERE id = $1`,
    [
      row.id,
      hasContent, contentEnc,
      hasEventAt, eventAt,
      hasLocation, locationEnc,
      hasTags, tags,
    ]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.ENTRY_UPDATE,
    target_type: 'entry',
    target_id: row.id,
    folder_id: row.folder_id,
    metadata: {
      fields: { content: hasContent, event_at: hasEventAt, location: hasLocation, tags: hasTags },
    },
  });

  return res.status(200).json({ ok: true });
}

// ---------------------------------------------------------------------------

async function handleDelete(req, res, user, row) {
  if (row.deleted_at) return res.status(410).json({ error: 'Entry already deleted' });
  if (row.entry_legal_hold || row.folder_legal_hold) {
    return res.status(409).json({
      error: 'This entry is under legal hold and cannot be deleted. Contact support@getsafetea.app.',
    });
  }

  await run(
    `UPDATE vault_entries SET deleted_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND legal_hold = false`,
    [row.id]
  );

  audit.write({
    req,
    actor_user_id: user.id,
    actor_role: 'owner',
    action: audit.ACTIONS.ENTRY_DELETE,
    target_type: 'entry',
    target_id: row.id,
    folder_id: row.folder_id,
    metadata: { soft_delete: true },
  });

  return res.status(200).json({ ok: true });
}
