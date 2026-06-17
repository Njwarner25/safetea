'use strict';

/**
 * Schema for `vault_affidavits` — one Evidentiary Abuse Affidavit per vault
 * folder. The structured affidavit JSON is stored encrypted under the
 * folder's DEK (envelope encryption, same as entries), so the column holds
 * ciphertext only.
 *
 * The migrate endpoint (api/migrate-vault-affidavit.js) provisions this; the
 * load/save/generate routes call this lazily so the feature works before the
 * migration runs.
 */
async function ensureVaultAffidavitSchema(run) {
  await run(`CREATE TABLE IF NOT EXISTS vault_affidavits (
    folder_id INTEGER PRIMARY KEY REFERENCES vault_folders(id) ON DELETE CASCADE,
    owner_user_id INTEGER NOT NULL,
    affidavit_enc TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
  )`);
}

module.exports = { ensureVaultAffidavitSchema };
