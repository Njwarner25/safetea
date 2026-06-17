/**
 * GET /api/vault/affidavit/generate?folder_id=X
 *
 * Renders the folder's Evidentiary Abuse Affidavit to a formal,
 * notarization-ready PDF and streams it as a download. The folder's stored
 * files are listed as numbered exhibits (incorporated by reference — the
 * bytes themselves stay in the vault, matching the export pipeline).
 *
 * SafeTea+ + VAULT_KEK gated, owner-only. The decrypted affidavit never
 * leaves this function except inside the PDF bytes sent to the owner.
 */

'use strict';

const { authenticate, cors } = require('../../_utils/auth');
const { getOne, getMany, run } = require('../../_utils/db');
const { unwrapFolderKey, decryptField } = require('../../../services/vault/encryption');
const { blockIfNotPlus } = require('../../../services/vault/gating');
const { ensureVaultAffidavitSchema } = require('../../_utils/vault-affidavit-schema');
const { renderAffidavitPdf } = require('../../../services/vault/affidavit');
const audit = require('../../../services/vault/audit');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;
  if (!process.env.VAULT_KEK) {
    return res.status(503).json({ error: 'Vault is not yet available. VAULT_KEK is not configured.' });
  }

  try {
    await ensureVaultAffidavitSchema(run);

    const folderId = parseInt(req.query.folder_id, 10);
    if (!Number.isInteger(folderId) || folderId <= 0) {
      return res.status(400).json({ error: 'folder_id query param required' });
    }

    const folder = await getOne(
      `SELECT id, owner_user_id, title_enc, dek_wrapped, dek_iv, dek_tag
         FROM vault_folders WHERE id = $1`,
      [folderId]
    );
    if (!folder || folder.owner_user_id !== user.id) {
      return res.status(404).json({ error: 'Folder not found' });
    }

    const affRow = await getOne(
      `SELECT affidavit_enc FROM vault_affidavits WHERE folder_id = $1`,
      [folderId]
    );
    if (!affRow) {
      return res.status(404).json({ error: 'No affidavit has been saved for this folder yet.' });
    }

    const fileRows = await getMany(
      `SELECT filename_enc, mime_type, created_at
         FROM vault_files
        WHERE folder_id = $1 AND deleted_at IS NULL
        ORDER BY created_at ASC`,
      [folderId]
    );

    const dek = unwrapFolderKey(folder);
    let pdfBuffer;
    try {
      const folderTitle = folder.title_enc ? decryptField(dek, folder.title_enc) : '';
      let affidavit = {};
      try { affidavit = JSON.parse(decryptField(dek, affRow.affidavit_enc)) || {}; } catch (_) { affidavit = {}; }

      const exhibits = fileRows.map(function (f) {
        let name = 'file';
        try { if (f.filename_enc) name = decryptField(dek, f.filename_enc) || 'file'; } catch (_) {}
        return { name: name, type: f.mime_type || '' };
      });

      pdfBuffer = await renderAffidavitPdf({
        affidavit: affidavit,
        folderTitle: folderTitle,
        exhibits: exhibits,
        generatedAt: new Date(),
      });
    } finally {
      dek.fill(0);
    }

    audit.write({
      req,
      actor_user_id: user.id,
      actor_role: 'owner',
      action: audit.ACTIONS.EXPORT_GENERATE,
      target_type: 'export',
      target_id: folderId,
      folder_id: folderId,
      metadata: { kind: 'affidavit', format: 'pdf' },
    });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 'attachment; filename="evidentiary-affidavit.pdf"');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    res.statusCode = 200;
    return res.end(pdfBuffer);
  } catch (err) {
    console.error('[vault/affidavit/generate] fatal:', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
