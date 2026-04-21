/**
 * SafeTea Safety Vault — V1 schema migration.
 *
 * Separated from api/migrate.js so the vault schema can be bootstrapped,
 * re-run, and rolled back independently. Safe to re-run: every statement
 * is CREATE TABLE IF NOT EXISTS or ADD COLUMN IF NOT EXISTS.
 *
 * Run:
 *   curl -X POST https://getsafetea.app/api/migrate-vault \
 *     -H "x-migrate-secret: $MIGRATE_SECRET"
 *
 * Related: services/vault/encryption.js, 2-product/specs/safety-vault.md
 */

'use strict';

const { sql } = require('@vercel/postgres');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, x-migrate-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  try {
    // ============================================================
    // 1. vault_folders — the root container
    // ============================================================
    // All name/description fields are application-layer encrypted by the
    // caller; store them as TEXT (the base64 blob). The DEK is wrapped by
    // VAULT_KEK and stored here so we can unwrap on read without leaving
    // the row.
    await sql`CREATE TABLE IF NOT EXISTS vault_folders (
      id            BIGSERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      title_enc        TEXT NOT NULL,
      description_enc  TEXT,
      dek_wrapped      TEXT NOT NULL,
      dek_iv           TEXT NOT NULL,
      dek_tag          TEXT NOT NULL,
      archived         BOOLEAN NOT NULL DEFAULT false,
      legal_hold       BOOLEAN NOT NULL DEFAULT false,
      emergency_release_settings JSONB NOT NULL DEFAULT '{}'::jsonb,
      ai_enabled       BOOLEAN NOT NULL DEFAULT false,
      created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_folders_owner ON vault_folders(owner_user_id) WHERE archived = false`; } catch(e) {}

    // ============================================================
    // 2. vault_entries — notes, logs, photos, screenshots, audio, docs
    // ============================================================
    // content_enc holds the entry body (text notes) or a JSON sidecar for
    // media entries (caption, transcript, etc.). The actual media bytes
    // live in vault_files.
    //
    // ai_summary_enc / ai_dates_enc are separate encrypted fields so AI
    // output never overwrites user input.
    await sql`CREATE TABLE IF NOT EXISTS vault_entries (
      id            BIGSERIAL PRIMARY KEY,
      folder_id     BIGINT NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entry_type    VARCHAR(20) NOT NULL CHECK (entry_type IN ('note','photo','screenshot','document','audio')),
      logged_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      event_at      TIMESTAMPTZ,
      location_enc  TEXT,
      content_enc   TEXT,
      ai_status     VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (ai_status IN ('pending','processed','skipped','error')),
      ai_confidence NUMERIC(4,3),
      ai_summary_enc TEXT,
      ai_dates_enc   TEXT,
      tags          TEXT[] NOT NULL DEFAULT '{}',
      legal_hold    BOOLEAN NOT NULL DEFAULT false,
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_entries_folder ON vault_entries(folder_id) WHERE deleted_at IS NULL`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_entries_event_time ON vault_entries(folder_id, event_at DESC) WHERE deleted_at IS NULL`; } catch(e) {}

    // ============================================================
    // 3. vault_files — object-storage references for media attachments
    // ============================================================
    // Never stores the bytes; only the opaque object-storage key, MIME,
    // size, checksum (SHA-256 of plaintext for integrity audit), and
    // optional encrypted filename metadata.
    await sql`CREATE TABLE IF NOT EXISTS vault_files (
      id            BIGSERIAL PRIMARY KEY,
      entry_id      BIGINT REFERENCES vault_entries(id) ON DELETE CASCADE,
      folder_id     BIGINT NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      uploader_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      storage_key   TEXT NOT NULL,
      mime_type     VARCHAR(100) NOT NULL,
      byte_size     BIGINT NOT NULL,
      checksum_sha256 CHAR(64) NOT NULL,
      filename_enc  TEXT,
      deleted_at    TIMESTAMPTZ,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_files_entry ON vault_files(entry_id) WHERE deleted_at IS NULL`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_files_folder ON vault_files(folder_id) WHERE deleted_at IS NULL`; } catch(e) {}

    // ============================================================
    // 4. vault_trusted_contacts — who can request access
    // ============================================================
    // Contacts do not have SafeTea accounts. We identify them by a stable
    // email (primary V1 OTP channel) + optional phone. invite_token lets
    // us verify requests came through the specific invite this owner
    // issued (not a spoofed form).
    await sql`CREATE TABLE IF NOT EXISTS vault_trusted_contacts (
      id            BIGSERIAL PRIMARY KEY,
      owner_user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      contact_email VARCHAR(200) NOT NULL,
      contact_phone VARCHAR(20),
      contact_name_enc TEXT NOT NULL,
      relationship_enc TEXT,
      invite_token  CHAR(48) NOT NULL UNIQUE,
      status        VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','active','revoked')),
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      activated_at  TIMESTAMPTZ,
      revoked_at    TIMESTAMPTZ,
      UNIQUE(owner_user_id, contact_email)
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_tc_owner ON vault_trusted_contacts(owner_user_id) WHERE status = 'active'`; } catch(e) {}

    // ============================================================
    // 5. vault_contact_permissions — per-folder scope per contact
    // ============================================================
    // A contact can have DIFFERENT rights per folder. auto_release_on_timeout
    // is the user-opt-in flag; countdown_hours is per-folder override of
    // the default 48h window.
    await sql`CREATE TABLE IF NOT EXISTS vault_contact_permissions (
      id                BIGSERIAL PRIMARY KEY,
      contact_id        BIGINT NOT NULL REFERENCES vault_trusted_contacts(id) ON DELETE CASCADE,
      folder_id         BIGINT NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      can_request       BOOLEAN NOT NULL DEFAULT true,
      auto_release_on_timeout BOOLEAN NOT NULL DEFAULT false,
      countdown_hours   INTEGER NOT NULL DEFAULT 48 CHECK (countdown_hours BETWEEN 1 AND 168),
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(contact_id, folder_id)
    )`;

    // ============================================================
    // 6. vault_access_requests — the access-request workflow state machine
    // ============================================================
    // A contact files a request; it sits open until the owner approves /
    // denies, or the countdown expires (triggering auto-release if the
    // permission row allows it).
    await sql`CREATE TABLE IF NOT EXISTS vault_access_requests (
      id                BIGSERIAL PRIMARY KEY,
      contact_id        BIGINT NOT NULL REFERENCES vault_trusted_contacts(id) ON DELETE CASCADE,
      owner_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      folder_id         BIGINT NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      reason            TEXT NOT NULL,
      status            VARCHAR(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied','expired','released')),
      otp_sent_at       TIMESTAMPTZ,
      otp_verified_at   TIMESTAMPTZ,
      countdown_ends_at TIMESTAMPTZ NOT NULL,
      resolved_at       TIMESTAMPTZ,
      release_export_id BIGINT,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_ar_owner_open ON vault_access_requests(owner_user_id) WHERE status = 'pending'`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_ar_countdown ON vault_access_requests(countdown_ends_at) WHERE status = 'pending'`; } catch(e) {}

    // ============================================================
    // 7. vault_exports — generated export bundles + signed share links
    // ============================================================
    // Row persists after the storage blob is deleted (for audit) — see
    // storage_key NULL-after-expiry semantics.
    await sql`CREATE TABLE IF NOT EXISTS vault_exports (
      id                BIGSERIAL PRIMARY KEY,
      folder_id         BIGINT NOT NULL REFERENCES vault_folders(id) ON DELETE CASCADE,
      owner_user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      triggered_by      VARCHAR(20) NOT NULL CHECK (triggered_by IN ('owner','access_request','sos','checkin_timeout')),
      access_request_id BIGINT REFERENCES vault_access_requests(id) ON DELETE SET NULL,
      format            VARCHAR(10) NOT NULL CHECK (format IN ('pdf','zip')),
      storage_key       TEXT,
      storage_deleted_at TIMESTAMPTZ,
      share_token       CHAR(48) UNIQUE,
      expires_at        TIMESTAMPTZ NOT NULL,
      downloaded_at     TIMESTAMPTZ,
      download_count    INTEGER NOT NULL DEFAULT 0,
      created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_exports_folder ON vault_exports(folder_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_exports_expiring ON vault_exports(expires_at) WHERE storage_deleted_at IS NULL`; } catch(e) {}

    // Wire vault_access_requests.release_export_id now that the target
    // table exists (FK was deferred to avoid circular dependency).
    try {
      await sql`ALTER TABLE vault_access_requests
        ADD CONSTRAINT fk_vault_ar_export FOREIGN KEY (release_export_id)
        REFERENCES vault_exports(id) ON DELETE SET NULL`;
    } catch(e) { /* already exists */ }

    // ============================================================
    // 8. vault_audit_log — append-only event stream
    // ============================================================
    // No UPDATE, no DELETE. Enforced by convention in application code +
    // a database trigger that RAISES on non-INSERT ops.
    await sql`CREATE TABLE IF NOT EXISTS vault_audit_log (
      id            BIGSERIAL PRIMARY KEY,
      actor_user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      actor_role    VARCHAR(20) NOT NULL,
      action        VARCHAR(40) NOT NULL,
      target_type   VARCHAR(20) NOT NULL,
      target_id     BIGINT,
      folder_id     BIGINT,
      ip_hash       CHAR(64),
      user_agent    TEXT,
      metadata      JSONB NOT NULL DEFAULT '{}'::jsonb,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_audit_folder ON vault_audit_log(folder_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_audit_actor ON vault_audit_log(actor_user_id)`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_audit_action ON vault_audit_log(action, created_at DESC)`; } catch(e) {}

    // Enforce append-only at the DB layer. Trigger fires on UPDATE or
    // DELETE and raises, so even an attacker with write access to the
    // table can only APPEND.
    try {
      await sql`CREATE OR REPLACE FUNCTION vault_audit_log_append_only()
        RETURNS TRIGGER AS $$
        BEGIN
          RAISE EXCEPTION 'vault_audit_log is append-only: % not allowed', TG_OP;
        END;
        $$ LANGUAGE plpgsql`;
      await sql`DROP TRIGGER IF EXISTS trg_vault_audit_log_append_only ON vault_audit_log`;
      await sql`CREATE TRIGGER trg_vault_audit_log_append_only
        BEFORE UPDATE OR DELETE ON vault_audit_log
        FOR EACH ROW EXECUTE FUNCTION vault_audit_log_append_only()`;
    } catch (e) {
      // Trigger creation may fail on some hosted PG variants — log and move on.
      // The application-layer convention still enforces append-only.
      console.warn('[migrate-vault] append-only trigger not installed:', e.message);
    }

    return res.status(200).json({
      ok: true,
      tables: [
        'vault_folders',
        'vault_entries',
        'vault_files',
        'vault_trusted_contacts',
        'vault_contact_permissions',
        'vault_access_requests',
        'vault_exports',
        'vault_audit_log',
      ],
    });
  } catch (err) {
    console.error('[migrate-vault] failed:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
