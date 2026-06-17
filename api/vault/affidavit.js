/**
 * Evidentiary Abuse Affidavit — load / save (one per folder).
 *
 *   GET  /api/vault/affidavit?folder_id=X
 *     → { affidavit: {...} | null, updated_at }
 *
 *   POST /api/vault/affidavit   { folder_id, affidavit }
 *     Upserts the affidavit for the folder. The structured JSON is sanitized
 *     then encrypted under the folder DEK before storage.
 *
 * SafeTea+ + VAULT_KEK gated, owner-only (folder ownership is the boundary).
 * NOTE: unlike community reports, the affidavit names the abuser by design —
 * it's the affiant's own sworn, encrypted record. No name/PII screening.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { unwrapFolderKey, encryptField, decryptField } = require('../../services/vault/encryption');
const { blockIfNotPlus } = require('../../services/vault/gating');
const { ensureVaultAffidavitSchema } = require('../_utils/vault-affidavit-schema');
const { sanitizeAffidavit } = require('../../services/vault/affidavit');
const audit = require('../../services/vault/audit');

async function loadOwnedFolder(folderId, userId) {
  const folder = await getOne(
    `SELECT id, owner_user_id, dek_wrapped, dek_iv, dek_tag, legal_hold
       FROM vault_folders WHERE id = $1`,
    [folderId]
  );
  if (!folder || folder.owner_user_id !== userId) return null;
  return folder;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  try {
    await ensureVaultAffidavitSchema(run);

    if (req.method === 'GET') {
      const folderId = parseInt(req.query.folder_id, 10);
      if (!Number.isInteger(folderId) || folderId <= 0) {
        return res.status(400).json({ error: 'folder_id query param required' });
      }
      const folder = await loadOwnedFolder(folderId, user.id);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });

      const row = await getOne(
        `SELECT affidavit_enc, updated_at FROM vault_affidavits WHERE folder_id = $1`,
        [folderId]
      );
      if (!row) return res.status(200).json({ affidavit: null, updated_at: null });

      const dek = unwrapFolderKey(folder);
      let affidavit = null;
      try {
        const json = decryptField(dek, row.affidavit_enc);
        affidavit = json ? JSON.parse(json) : null;
      } catch (_) {
        affidavit = null; // tamper / corruption — surface as empty rather than 500
      } finally {
        dek.fill(0);
      }
      return res.status(200).json({ affidavit: affidavit, updated_at: row.updated_at });
    }

    if (req.method === 'POST') {
      const body = (await parseBody(req)) || {};
      const folderId = parseInt(body.folder_id, 10);
      if (!Number.isInteger(folderId) || folderId <= 0) {
        return res.status(400).json({ error: 'folder_id is required' });
      }
      const folder = await loadOwnedFolder(folderId, user.id);
      if (!folder) return res.status(404).json({ error: 'Folder not found' });
      if (folder.legal_hold) {
        return res.status(409).json({ error: 'Folder is under legal hold. Edits are blocked until the hold is released.' });
      }

      const clean = sanitizeAffidavit(body.affidavit);
      const dek = unwrapFolderKey(folder);
      let enc;
      try {
        enc = encryptField(dek, JSON.stringify(clean));
      } finally {
        dek.fill(0);
      }

      await run(
        `INSERT INTO vault_affidavits (folder_id, owner_user_id, affidavit_enc, updated_at)
         VALUES ($1, $2, $3, NOW())
         ON CONFLICT (folder_id)
         DO UPDATE SET affidavit_enc = EXCLUDED.affidavit_enc, updated_at = NOW()`,
        [folderId, user.id, enc]
      );

      audit.write({
        req,
        actor_user_id: user.id,
        actor_role: 'owner',
        action: audit.ACTIONS.ENTRY_UPDATE,
        target_type: 'entry',
        target_id: folderId,
        folder_id: folderId,
        metadata: { kind: 'affidavit', incidents: clean.incidents.length, witnesses: clean.witnesses.length },
      });

      return res.status(200).json({ ok: true, affidavit: clean });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[vault/affidavit] fatal:', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
