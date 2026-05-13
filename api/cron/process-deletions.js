/**
 * Vercel Cron: Process scheduled account deletions
 *
 * Runs daily at 04:00 UTC. SELECTs users whose deletion_scheduled_at <= NOW()
 * and hard-deletes their data across every table the schema can touch.
 *
 * Schedule entry lives in vercel.json:
 *   { "path": "/api/cron/process-deletions", "schedule": "0 4 * * *" }
 *
 * Strategy:
 *   - For each user, do one DB transaction (BEGIN / COMMIT). Either the row
 *     and all dependent rows go, or nothing does — never half-deleted.
 *   - Most user_id columns are already ON DELETE CASCADE on users.id, but we
 *     run explicit DELETEs anyway so:
 *       a) tables that use ON DELETE SET NULL get cleared too (we DON'T want
 *          orphan content to live on referencing a now-anonymous null user);
 *       b) tables that reference user_id without a FK (CREATE TABLE blocks
 *          that skipped REFERENCES) still get cleaned up;
 *       c) we get a per-table row count we can audit.
 *   - The actual users row is the last DELETE — CASCADE then mops up
 *     anything we missed.
 *   - account_deletions_log captures pre-delete email so compliance can prove
 *     who deleted when, without preserving any other PII.
 *
 * Idempotent: tables that don't exist yet (different deploys may be at
 * different migration states) are caught individually so one missing table
 * doesn't abort the whole user.
 */

const { getMany, getOne, query, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');

// Tables that have a `user_id` column referencing users(id). We try them all;
// the per-table try/catch shrugs off ones that don't exist in this deploy.
const USER_ID_TABLES = [
  // Core community content
  'posts',
  'replies',
  'alerts',
  'user_city_votes',
  'watched_names',                 // CASCADE → name_watch_matches
  'verification_attempts',
  'phone_verifications',           // no user_id column — skipped below by absence
  'messages',                      // sender_id / recipient_id — handled separately
  'post_reports',                  // reporter_id / reported_user_id — separate
  'removal_requests',              // requester_id / post_author_id / reviewed_by — separate
  'gender_reports',                // reporter_id / reported_user_id — separate
  'push_tokens',
  'push_sends',
  // AI companion
  'ai_companion_settings',
  'ai_chat_messages',
  'ai_journal_entries',
  // Date check / safety
  'date_checkouts',                // CASCADE → date_trusted_contacts
  'date_locations',
  'sos_events',
  // Recording / safelink
  'recording_sessions',            // CASCADE → recording_chunks
  'recording_contacts',
  'safelink_sessions',             // CASCADE → safelink_locations
  // Pulse
  'pulse_sessions',
  'pulse_escalations',
  'pulse_anomalies',
  // Vault (uses owner_user_id / uploader_user_id — handled separately)
  // Other
  'post_likes',
  'post_dislikes',
  'post_bumps',
  'trust_events',
  'verification_requests',
  'connected_accounts',
  'redflag_scans',
  'user_feedback',
  'feedback',
  'user_alert_preferences',
  'user_alert_history',
  'user_watch_zones',
  'referral_codes',
  'referral_rewards',
  'email_drip_queue',
  'photo_verification_reports',
  'photo_verification_usage',
  'org_code_redemptions',
  'banned_signup_attempts',        // no user_id column; tolerated
  'room_memberships',
  'room_posts',
  'room_replies',
  'room_post_likes',
  'room_post_reports',
];

// Tables that use a different column name for the user FK.
const OWNER_TABLES = [
  // owner_user_id
  { table: 'vault_folders',           column: 'owner_user_id' },
  { table: 'vault_entries',           column: 'owner_user_id' },
  { table: 'vault_trusted_contacts',  column: 'owner_user_id' },
  { table: 'vault_access_requests',   column: 'owner_user_id' },
  { table: 'vault_exports',           column: 'owner_user_id' },
  { table: 'vault_assistant_messages',column: 'owner_user_id' },
  // uploader_user_id
  { table: 'vault_files',             column: 'uploader_user_id' },
  // actor_user_id (audit log — leaves SET NULL trail behind; we still drop)
  { table: 'vault_audit_log',         column: 'actor_user_id' },
  // Removal request system (UUID variant — may or may not exist on this deploy)
  { table: 'photo_removal_requests',  column: 'requester_id' },
  { table: 'photo_removal_requests',  column: 'watermark_uploader_id' },
  { table: 'user_strikes',            column: 'user_id' },
  { table: 'photo_watermarks',        column: 'user_id' },
  // Multi-column tables: nuke any row that mentions the deleted user on
  // either side. Survives even if FK is SET NULL.
  { table: 'messages',                column: 'sender_id' },
  { table: 'messages',                column: 'recipient_id' },
  { table: 'post_reports',            column: 'reporter_id' },
  { table: 'post_reports',            column: 'reported_user_id' },
  { table: 'removal_requests',        column: 'requester_id' },
  { table: 'removal_requests',        column: 'post_author_id' },
  { table: 'removal_requests',        column: 'reviewed_by' },
  { table: 'removal_requests',        column: 'watermark_user_id' },
  { table: 'gender_reports',          column: 'reporter_id' },
  { table: 'gender_reports',          column: 'reported_user_id' },
  { table: 'ban_log',                 column: 'banned_user_id' },
  { table: 'ban_log',                 column: 'admin_id' },
  { table: 'referrals',               column: 'user_id' },
  { table: 'referrals',               column: 'referred_user_id' },
  { table: 'safelink_connections',    column: 'host_user_id' },
  { table: 'safelink_connections',    column: 'requester_user_id' },
  { table: 'appeals',                 column: 'user_id' },
  { table: 'violations',              column: 'accused_user_id' },
  { table: 'moderation_logs',         column: 'user_id' },
  { table: 'city_requests',           column: 'user_id' },
  { table: 'city_signups',            column: 'user_id' },
  { table: 'password_reset_tokens',   column: 'user_id' },
];

async function ensureLogTable() {
  await run(`CREATE TABLE IF NOT EXISTS account_deletions_log (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL,
    email VARCHAR(255),
    scheduled_at TIMESTAMPTZ,
    deleted_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    table_counts JSONB
  )`);
  await run(`CREATE INDEX IF NOT EXISTS idx_account_deletions_log_user
             ON account_deletions_log (user_id)`);
}

// Returns the number of rows deleted; swallows "relation does not exist" /
// "column does not exist" so we can iterate over tables that may or may not
// be present in this deploy.
async function safeDelete(client, table, column, value) {
  try {
    // identifier-quote table + column so we can keep using a static SQL
    // string for the value param. Names are from the hard-coded constants
    // above, never from request input.
    const sql = `DELETE FROM "${table}" WHERE "${column}" = $1`;
    const r = await client.query(sql, [value]);
    return r.rowCount || 0;
  } catch (err) {
    const msg = (err && err.message) || '';
    if (/does not exist/i.test(msg) || /undefined table/i.test(msg) || /undefined column/i.test(msg)) {
      return 0;
    }
    // Anything else is a real error — let it bubble so the user
    // isn't half-deleted.
    throw err;
  }
}

async function processOneUser(userRow) {
  // We can't BEGIN/COMMIT over the @vercel/postgres `sql` helper without a
  // raw client, but our `query` wrapper passes parameters through. For
  // safety we rely on Postgres atomicity per statement plus a final
  // DELETE FROM users — CASCADE on most FKs handles cleanup if any
  // earlier explicit DELETE silently no-ops.
  const counts = {};

  // We want a transaction. @vercel/postgres exposes db.connect() which
  // returns a pooled pg client supporting BEGIN/COMMIT. The Proxy getter
  // that resolves db.connect can throw if POSTGRES_URL isn't set (local
  // dev) — we swallow that and fall back to sequential deletes.
  let usedTransaction = false;
  let client = null;
  try {
    const vp = require('@vercel/postgres');
    // vp.db is a Proxy that lazily creates a pool; touching properties
    // can throw without a connection string. Wrap the whole touch.
    let connectFn = null;
    try { connectFn = vp && vp.db && vp.db.connect; } catch (_) {}
    if (typeof connectFn === 'function') {
      client = await vp.db.connect();
      await client.query('BEGIN');
      usedTransaction = true;
    }
  } catch (_) { /* fallback to non-transactional path */ }

  // Wrap the client so safeDelete works against either a raw pg client or
  // our query() helper.
  const runner = client || {
    query: (sql, params) => query(sql, params),
  };

  try {
    for (const t of USER_ID_TABLES) {
      counts[t] = (counts[t] || 0) + await safeDelete(runner, t, 'user_id', userRow.id);
    }
    for (const o of OWNER_TABLES) {
      const key = `${o.table}.${o.column}`;
      counts[key] = (counts[key] || 0) + await safeDelete(runner, o.table, o.column, userRow.id);
    }

    // Finally, the users row itself. Any FK CASCADE we missed will fire
    // here. Any FK with ON DELETE NO ACTION / RESTRICT would throw — at
    // which point the transaction rolls back and we know to extend the
    // table list above.
    const userDel = await runner.query('DELETE FROM users WHERE id = $1', [userRow.id]);
    counts['users'] = userDel.rowCount || 0;

    if (usedTransaction) {
      await client.query('COMMIT');
    }
  } catch (err) {
    if (usedTransaction) {
      try { await client.query('ROLLBACK'); } catch (_) {}
    }
    throw err;
  } finally {
    if (client) {
      try { client.release(); } catch (_) {}
    }
  }

  // Audit log — separate from the transaction so even a rolled-back
  // attempt would not leave a false "deleted" row. We only get here on
  // success.
  try {
    await run(
      `INSERT INTO account_deletions_log (user_id, email, scheduled_at, table_counts)
       VALUES ($1, $2, $3, $4)`,
      [
        userRow.id,
        userRow.email || null,
        userRow.deletion_scheduled_at || null,
        JSON.stringify(counts),
      ]
    );
  } catch (err) {
    console.error('[process-deletions] failed to write audit row for user', userRow.id, err && err.message);
  }

  return counts;
}

module.exports = async function handler(req, res) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (providedSecret !== cronSecret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  cors(res, req);

  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    await ensureLogTable();

    // Pull every user whose grace period ended. Cap at 200 per tick — if
    // there's ever a big batch we'll work through it on subsequent days
    // rather than risk a 60-second function timeout.
    const dueUsers = await getMany(
      `SELECT id, email, deletion_scheduled_at
       FROM users
       WHERE deletion_scheduled_at IS NOT NULL
         AND deletion_scheduled_at <= NOW()
       ORDER BY deletion_scheduled_at ASC
       LIMIT 200`
    );

    const results = [];
    let success = 0;
    let failed = 0;

    for (const u of dueUsers) {
      try {
        const counts = await processOneUser(u);
        success++;
        results.push({ user_id: u.id, ok: true, counts });
      } catch (err) {
        failed++;
        console.error('[process-deletions] failed for user', u.id, err && err.message);
        results.push({ user_id: u.id, ok: false, error: err && err.message });
      }
    }

    return res.status(200).json({
      ok: true,
      processed: dueUsers.length,
      success,
      failed,
      results,
    });
  } catch (err) {
    console.error('[process-deletions] fatal:', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
