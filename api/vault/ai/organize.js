/**
 * POST /api/vault/ai/organize
 *   Body: { entry_id }
 *
 * Runs AI organization on a single entry. The client calls this after a
 * successful entry creation (or edit) in an AI-enabled folder. The server
 * is stateless about AI — the client decides when to trigger.
 *
 * Ownership: derived via the entry -> folder JOIN, same pattern as the
 * entry CRUD handlers.
 *
 * Side effects:
 *   - Decrypts the entry content with the folder DEK
 *   - Calls Gemini
 *   - Re-encrypts summary + extracted dates with the folder DEK
 *   - Updates ai_status / ai_confidence / ai_summary_enc / ai_dates_enc
 *   - Writes AI_ORGANIZE audit row with per-entry metadata
 *
 * Skipped gracefully if the folder has ai_enabled = false, if the entry
 * was soft-deleted, or if Gemini returns an empty / safety-blocked
 * response. All three paths leave the original content untouched.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../../_utils/auth');
const { getOne, run } = require('../../_utils/db');
const { unwrapFolderKey, encryptField, decryptField } = require('../../../services/vault/encryption');
const { organizeText } = require('../../../services/vault/ai');
const audit = require('../../../services/vault/audit');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (!process.env.VAULT_KEK) return res.status(503).json({ error: 'Vault not configured' });
  if (!process.env.VAULT_GEMINI_API_KEY) {
    return res.status(503).json({ error: 'AI organization not configured' });
  }

  const body = (await parseBody(req)) || {};
  const entryId = parseInt(body.entry_id, 10);
  if (!Number.isInteger(entryId) || entryId <= 0) {
    return res.status(400).json({ error: 'entry_id required' });
  }

  try {
    const row = await getOne(
      `SELECT e.id, e.folder_id, e.owner_user_id, e.content_enc, e.ai_status, e.deleted_at,
              f.owner_user_id AS folder_owner, f.ai_enabled,
              f.dek_wrapped, f.dek_iv, f.dek_tag
       FROM vault_entries e
       JOIN vault_folders f ON f.id = e.folder_id
       WHERE e.id = $1`,
      [entryId]
    );

    if (!row || row.folder_owner !== user.id) {
      return res.status(404).json({ error: 'Entry not found' });
    }
    if (row.deleted_at) return res.status(410).json({ error: 'Entry deleted' });
    if (!row.ai_enabled) {
      return res.status(403).json({ error: 'AI is not enabled for this folder' });
    }
    if (!row.content_enc) {
      // Nothing to summarize (e.g., media entry with no caption)
      await run(
        `UPDATE vault_entries SET ai_status = 'skipped', updated_at = NOW() WHERE id = $1`,
        [entryId]
      );
      return res.status(200).json({ status: 'skipped', reason: 'no content to organize' });
    }

    // Mark processing state so concurrent triggers don't double-run. Not a
    // true lock — V2 can add SELECT FOR UPDATE if needed.
    await run(
      `UPDATE vault_entries SET ai_status = 'pending', updated_at = NOW() WHERE id = $1`,
      [entryId]
    );

    // Decrypt content, call Gemini, re-encrypt output.
    const dek = unwrapFolderKey(row);
    let aiResult;
    try {
      const plaintext = decryptField(dek, row.content_enc);
      aiResult = await organizeText(plaintext);

      const summaryEnc = aiResult.summary ? encryptField(dek, aiResult.summary) : null;
      const datesEnc = (aiResult.extracted_dates && aiResult.extracted_dates.length)
        ? encryptField(dek, JSON.stringify(aiResult.extracted_dates))
        : null;

      const finalStatus = aiResult.skipped_by_safety ? 'skipped'
        : (summaryEnc || datesEnc) ? 'processed'
        : 'skipped';

      await run(
        `UPDATE vault_entries SET
           ai_status     = $2,
           ai_confidence = $3,
           ai_summary_enc = $4,
           ai_dates_enc  = $5,
           updated_at    = NOW()
         WHERE id = $1`,
        [entryId, finalStatus, aiResult.overall_confidence, summaryEnc, datesEnc]
      );

      audit.write({
        req,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: audit.ACTIONS.AI_ORGANIZE,
        target_type: 'entry',
        target_id: entryId,
        folder_id: row.folder_id,
        metadata: {
          status: finalStatus,
          confidence: aiResult.overall_confidence,
          tag_count: (aiResult.suggested_tags || []).length,
          date_count: (aiResult.extracted_dates || []).length,
          safety_blocked: !!aiResult.skipped_by_safety,
        },
      });

      return res.status(200).json({
        status: finalStatus,
        summary: aiResult.summary || null,
        suggested_tags: aiResult.suggested_tags || [],
        extracted_dates: aiResult.extracted_dates || [],
        overall_confidence: aiResult.overall_confidence,
      });
    } finally {
      dek.fill(0);
    }
  } catch (err) {
    console.error('[vault/ai/organize] failed:', err && err.message);
    // Mark the entry as errored so the client can retry from a known state.
    try {
      await run(
        `UPDATE vault_entries SET ai_status = 'error', updated_at = NOW() WHERE id = $1`,
        [entryId]
      );
    } catch (_) {}
    return res.status(500).json({ error: 'AI organization failed', details: err && err.message });
  }
};
