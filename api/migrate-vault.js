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

    // OTP tracking columns on vault_access_requests. Never stores the
    // plaintext code — only a SHA-256 hash. otp_attempts guards brute-force.
    try { await sql`ALTER TABLE vault_access_requests ADD COLUMN IF NOT EXISTS otp_code_hash CHAR(64)`; } catch(e) {}
    try { await sql`ALTER TABLE vault_access_requests ADD COLUMN IF NOT EXISTS otp_expires_at TIMESTAMPTZ`; } catch(e) {}
    try { await sql`ALTER TABLE vault_access_requests ADD COLUMN IF NOT EXISTS otp_attempts INTEGER NOT NULL DEFAULT 0`; } catch(e) {}

    // Short-lived session tokens for the contact-facing portal. The contact
    // is NOT a SafeTea account holder; this is the only auth surface they
    // touch. Token = 32-byte base64url. Expires in 30 min.
    await sql`CREATE TABLE IF NOT EXISTS vault_contact_sessions (
      token         CHAR(43) PRIMARY KEY,
      contact_id    BIGINT NOT NULL REFERENCES vault_trusted_contacts(id) ON DELETE CASCADE,
      expires_at    TIMESTAMPTZ NOT NULL,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_contact_sessions_exp ON vault_contact_sessions(expires_at)`; } catch(e) {}

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

    // ============================================================
    // 9. vault_resources — curated safety-resource directory
    // ============================================================
    // The Journaling Assistant is NEVER allowed to invent providers.
    // It queries this table and surfaces only what comes back. Entries
    // are hand-vetted by SafeTea + Community agent before they land here.
    // Seed rows below cover national, vetted resources for V1; local
    // providers (therapists, shelters) are deferred to V2 once a
    // partnership + licensure verification process exists.
    await sql`CREATE TABLE IF NOT EXISTS vault_resources (
      id            BIGSERIAL PRIMARY KEY,
      category      VARCHAR(30) NOT NULL CHECK (category IN (
        'hotline','crisis_chat','app','directory','legal_aid','shelter'
      )),
      name          VARCHAR(200) NOT NULL,
      description   TEXT NOT NULL,
      url           TEXT,
      phone         VARCHAR(30),
      sms_info      VARCHAR(100),
      country       VARCHAR(2) NOT NULL DEFAULT 'US',
      state         VARCHAR(2),
      city          VARCHAR(100),
      tags          TEXT[] NOT NULL DEFAULT '{}',
      verified_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      verified_by   VARCHAR(100),
      active        BOOLEAN NOT NULL DEFAULT true,
      sort_order    INTEGER NOT NULL DEFAULT 0,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`;
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_resources_category ON vault_resources(category) WHERE active = true`; } catch(e) {}
    try { await sql`CREATE INDEX IF NOT EXISTS idx_vault_resources_region ON vault_resources(country, state) WHERE active = true`; } catch(e) {}

    // Seed the V1 curated list. Idempotent via UNIQUE on (name, country).
    try { await sql`CREATE UNIQUE INDEX IF NOT EXISTS uq_vault_resources_name_country ON vault_resources(name, country)`; } catch(e) {}

    // Hotlines (national, US)
    await sql`INSERT INTO vault_resources (category, name, description, phone, sms_info, tags, verified_by, sort_order)
      VALUES ('hotline', '988 Suicide & Crisis Lifeline',
        'Free, confidential, 24/7 support for anyone in suicidal crisis or emotional distress.',
        '988', 'Text or call 988',
        ARRAY['suicide','crisis','mental_health','24_7'],
        'SafeTea curated', 10)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, sms_info, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'National Domestic Violence Hotline',
        '24/7 support, safety planning, and local referrals. Advocates are trained specifically in intimate-partner violence.',
        '1-800-799-7233', 'Text START to 88788',
        'https://www.thehotline.org',
        ARRAY['dv','ipv','safety_planning','24_7'],
        'SafeTea curated', 20)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'RAINN National Sexual Assault Hotline',
        '24/7 confidential support. Connects to local rape-crisis centers.',
        '1-800-656-4673', 'https://www.rainn.org',
        ARRAY['sexual_assault','rape','crisis','24_7'],
        'SafeTea curated', 30)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'Childhelp National Child Abuse Hotline',
        'If you are worried about a child or are a young person in danger.',
        '1-800-422-4453', 'https://www.childhelphotline.org',
        ARRAY['child_abuse','youth','24_7'],
        'SafeTea curated', 40)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'StrongHearts Native Helpline',
        'Culturally appropriate DV and sexual-violence support for Native Americans and Alaska Natives.',
        '1-844-762-8483', 'https://strongheartshelpline.org',
        ARRAY['dv','native','indigenous','24_7'],
        'SafeTea curated', 50)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'Trans Lifeline',
        'Peer support for transgender people in crisis. Staffed by trans operators.',
        '1-877-565-8860', 'https://translifeline.org',
        ARRAY['trans','lgbtq','crisis'],
        'SafeTea curated', 60)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, phone, url, tags, verified_by, sort_order)
      VALUES ('hotline', 'Love Is Respect',
        'Dating-abuse helpline for teens and young adults. Text, chat, or call.',
        '1-866-331-9474', 'https://www.loveisrespect.org',
        ARRAY['dating_abuse','youth','24_7'],
        'SafeTea curated', 70)
      ON CONFLICT (name, country) DO NOTHING`;

    // Crisis chat
    await sql`INSERT INTO vault_resources (category, name, description, sms_info, url, tags, verified_by, sort_order)
      VALUES ('crisis_chat', 'Crisis Text Line',
        'Free, 24/7 text-based support with a trained crisis counselor. Works when calling isn''t safe.',
        'Text HOME to 741741',
        'https://www.crisistextline.org',
        ARRAY['crisis','text','24_7','silent'],
        'SafeTea curated', 110)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('crisis_chat', 'RAINN Online Chat',
        'Chat 1-on-1 with a trained staff member from a rape-crisis center.',
        'https://hotline.rainn.org/online',
        ARRAY['sexual_assault','chat','24_7','silent'],
        'SafeTea curated', 120)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('crisis_chat', 'NDVH Online Chat',
        'Private web-chat with a DV advocate. Works when calling could be overheard.',
        'https://www.thehotline.org/get-help',
        ARRAY['dv','chat','24_7','silent'],
        'SafeTea curated', 130)
      ON CONFLICT (name, country) DO NOTHING`;

    // Apps (DV-specific)
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'myPlan',
        'Safety-planning app built by Johns Hopkins for people in relationships that feel unsafe. Private; includes a quick-exit feature.',
        'https://www.myplanapp.org',
        ARRAY['dv','safety_planning','quick_exit','free'],
        'SafeTea curated', 210)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Bright Sky',
        'Free UK-based app (works internationally) for anyone in, or worried about, a domestic-abuse situation.',
        'https://www.hestia.org/brightsky',
        ARRAY['dv','safety_planning','free'],
        'SafeTea curated', 220)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Aspire News',
        'Disguised as a news app; inside is a hidden emergency button that alerts your trusted contacts with your location.',
        'https://www.whengeorgiasmiled.org/aspire-news-app',
        ARRAY['dv','disguised','emergency','free'],
        'SafeTea curated', 230)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Noonlight',
        'Panic-button safety app. A long-press summons trained dispatchers who can send police without you saying a word.',
        'https://www.noonlight.com',
        ARRAY['sos','panic_button','paid'],
        'SafeTea curated', 240)
      ON CONFLICT (name, country) DO NOTHING`;

    // Apps (mental health + therapy)
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Calm',
        'Guided meditations, sleep stories, and breathing exercises. Useful for regulating the nervous system after a trauma response.',
        'https://www.calm.com',
        ARRAY['mental_health','meditation','sleep','paid_freemium'],
        'SafeTea curated', 310)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Headspace',
        'Meditation and mindfulness with specific programs for anxiety, sleep, and processing difficult emotions.',
        'https://www.headspace.com',
        ARRAY['mental_health','meditation','paid_freemium'],
        'SafeTea curated', 320)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'Talkspace',
        'Subscription-based online therapy with licensed clinicians. Some plans accept insurance.',
        'https://www.talkspace.com',
        ARRAY['therapy','licensed','paid'],
        'SafeTea curated', 330)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('app', 'BetterHelp',
        'Large online-therapy platform; offers trauma-informed therapist filters and financial-aid tiers.',
        'https://www.betterhelp.com',
        ARRAY['therapy','licensed','paid','financial_aid'],
        'SafeTea curated', 340)
      ON CONFLICT (name, country) DO NOTHING`;

    // Directories
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('directory', 'Psychology Today — trauma-informed therapist finder',
        'Filterable therapist directory. Use the "trauma and PTSD" specialty filter plus your state to find nearby providers.',
        'https://www.psychologytoday.com/us/therapists/trauma-and-ptsd',
        ARRAY['therapy','directory','trauma_informed'],
        'SafeTea curated', 410)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('directory', 'RAINN Local Centers',
        'Find your nearest rape-crisis center with 24/7 advocates, free medical accompaniment, and legal support.',
        'https://centers.rainn.org',
        ARRAY['sexual_assault','directory','free'],
        'SafeTea curated', 420)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('directory', 'DomesticShelters.org',
        'Searchable directory of DV shelters nationwide with services, capacity, and eligibility notes.',
        'https://www.domesticshelters.org',
        ARRAY['dv','shelter','directory','free'],
        'SafeTea curated', 430)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('directory', 'WomensLaw.org',
        'State-by-state legal information for survivors: restraining orders, custody, immigration, housing.',
        'https://www.womenslaw.org',
        ARRAY['legal','dv','state_specific','free'],
        'SafeTea curated', 440)
      ON CONFLICT (name, country) DO NOTHING`;

    // Legal aid
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('legal_aid', 'Legal Services Corporation',
        'Find free civil legal-aid programs in your area. Covers family, housing, immigration.',
        'https://www.lsc.gov/about-lsc/what-legal-aid/find-legal-aid',
        ARRAY['legal','free','state_specific'],
        'SafeTea curated', 510)
      ON CONFLICT (name, country) DO NOTHING`;
    await sql`INSERT INTO vault_resources (category, name, description, url, tags, verified_by, sort_order)
      VALUES ('legal_aid', 'National Network to End Domestic Violence',
        'Technology, policy, and legal resources for DV survivors. Partners with local orgs in every state.',
        'https://www.nnedv.org',
        ARRAY['dv','legal','policy','directory'],
        'SafeTea curated', 520)
      ON CONFLICT (name, country) DO NOTHING`;

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
        'vault_resources',
      ],
      resources_seeded: true,
    });
  } catch (err) {
    console.error('[migrate-vault] failed:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
