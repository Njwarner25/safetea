/**
 * POST /api/admin/wipe-non-admin-users
 *
 * Destructive admin tool. Deletes every user account whose role is not
 * 'admin' or 'moderator' and whose email does not end in
 * '@seed.safetea.local' — plus every FK-dependent row across the
 * schema.
 *
 * Guardrails:
 *   - Admin auth required
 *   - Two-step: dry_run=true returns counts only
 *   - Actual wipe requires body.confirm === 'WIPE' literal
 *   - Refuses if the target set includes any user with an active
 *     Stripe subscription (sanity check — even if the founder says
 *     no paid users, catch the case where one slipped in)
 *   - Deletes in FK-safe order
 *
 * Body: { dry_run: true|false, confirm: "WIPE" (required when dry_run=false) }
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

const STAFF_ROLES = ['admin', 'moderator'];
const SEED_EMAIL_SUFFIX = '@seed.safetea.local';

async function countTarget() {
  const row = await getOne(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE (role IS NULL OR role NOT IN ('admin','moderator'))
       AND COALESCE(email, '') NOT LIKE '%' || $1`,
    [SEED_EMAIL_SUFFIX]
  );
  return (row && row.n) || 0;
}

async function countKept() {
  const row = await getOne(
    `SELECT
      COUNT(*) FILTER (WHERE role = 'admin')::int AS admins,
      COUNT(*) FILTER (WHERE role = 'moderator')::int AS mods,
      COUNT(*) FILTER (WHERE COALESCE(email,'') LIKE '%' || $1)::int AS seeds,
      COUNT(*)::int AS total
     FROM users`,
    [SEED_EMAIL_SUFFIX]
  );
  return row || { admins: 0, mods: 0, seeds: 0, total: 0 };
}

async function countStripeRisk() {
  // Any non-staff, non-seed user with a stripe_subscription_id is a paid
  // user we'd be wiping without cancelling the sub. Refuse in that case.
  const row = await getOne(
    `SELECT COUNT(*)::int AS n FROM users
     WHERE (role IS NULL OR role NOT IN ('admin','moderator'))
       AND COALESCE(email,'') NOT LIKE '%' || $1
       AND stripe_subscription_id IS NOT NULL
       AND stripe_subscription_id <> ''`,
    [SEED_EMAIL_SUFFIX]
  );
  return (row && row.n) || 0;
}

/**
 * FK-safe cascade delete for a single user_id. Each DELETE is wrapped
 * in catch() because some tables may not exist on every deployment
 * (e.g., legacy schemas missing the vault_* tables). We want a best-
 * effort cleanup, not a cascade failure.
 */
async function purgeUser(uid) {
  const steps = [
    // Vault — folders cascade to entries/files/audit via FK, but do the
    // explicit deletes anyway since old rows may have been created
    // before cascade constraints were tightened.
    ['vault_assistant_messages', `DELETE FROM vault_assistant_messages WHERE folder_id IN (SELECT id FROM vault_folders WHERE owner_user_id = $1)`],
    ['vault_exports',           `DELETE FROM vault_exports WHERE owner_user_id = $1`],
    ['vault_access_requests',   `DELETE FROM vault_access_requests WHERE owner_user_id = $1`],
    ['vault_contact_sessions',  `DELETE FROM vault_contact_sessions WHERE contact_id IN (SELECT id FROM vault_trusted_contacts WHERE owner_user_id = $1)`],
    ['vault_contact_permissions', `DELETE FROM vault_contact_permissions WHERE contact_id IN (SELECT id FROM vault_trusted_contacts WHERE owner_user_id = $1)`],
    ['vault_trusted_contacts',  `DELETE FROM vault_trusted_contacts WHERE owner_user_id = $1`],
    ['vault_files',             `DELETE FROM vault_files WHERE folder_id IN (SELECT id FROM vault_folders WHERE owner_user_id = $1)`],
    ['vault_entries',           `DELETE FROM vault_entries WHERE folder_id IN (SELECT id FROM vault_folders WHERE owner_user_id = $1)`],
    ['vault_audit_log',         `DELETE FROM vault_audit_log WHERE actor_user_id = $1`],
    ['vault_folders',           `DELETE FROM vault_folders WHERE owner_user_id = $1`],

    // Community + moderation
    ['post_likes',          `DELETE FROM post_likes WHERE user_id = $1`],
    ['post_dislikes',       `DELETE FROM post_dislikes WHERE user_id = $1`],
    ['post_bumps',          `DELETE FROM post_bumps WHERE user_id = $1`],
    ['post_reports',        `DELETE FROM post_reports WHERE user_id = $1`],
    ['replies',             `DELETE FROM replies WHERE user_id = $1`],
    ['trust_events',        `DELETE FROM trust_events WHERE user_id = $1`],
    ['moderation_logs',     `DELETE FROM moderation_logs WHERE target_id = $1::text`],
    ['removal_requests',    `DELETE FROM removal_requests WHERE user_id = $1`],
    ['gender_reports',      `DELETE FROM gender_reports WHERE reporter_id = $1 OR target_user_id = $1`],
    ['ban_log',             `DELETE FROM ban_log WHERE user_id = $1 OR admin_id = $1`],

    // Messages / inbox
    ['messages',            `DELETE FROM messages WHERE sender_id = $1 OR recipient_id = $1`],

    // Name watch
    ['name_watch_matches',  `DELETE FROM name_watch_matches WHERE watched_name_id IN (SELECT id FROM watched_names WHERE user_id = $1)`],
    ['watched_names',       `DELETE FROM watched_names WHERE user_id = $1`],

    // Social / connections
    ['connected_accounts',  `DELETE FROM connected_accounts WHERE user_id = $1`],
    ['user_city_votes',     `DELETE FROM user_city_votes WHERE user_id = $1`],
    ['push_tokens',         `DELETE FROM push_tokens WHERE user_id = $1`],
    ['phone_verifications', `DELETE FROM phone_verifications WHERE user_id = $1`],
    ['verification_attempts', `DELETE FROM verification_attempts WHERE user_id = $1`],

    // Rooms
    ['room_memberships',    `DELETE FROM room_memberships WHERE user_id = $1`],
    ['room_posts',          `DELETE FROM room_posts WHERE author_id = $1`],
    ['rooms',               `DELETE FROM rooms WHERE created_by = $1`],

    // Dates / Safewalk / Pulse / SafeLink sessions
    ['pulse_sessions',      `DELETE FROM pulse_sessions WHERE user_id = $1`],
    ['safelink_sessions',   `DELETE FROM safelink_sessions WHERE user_id = $1`],
    ['safelink_connections', `DELETE FROM safelink_connections WHERE user_a_id = $1 OR user_b_id = $1`],
    ['date_checkouts',      `DELETE FROM date_checkouts WHERE user_id = $1`],
    ['recording_sessions',  `DELETE FROM recording_sessions WHERE user_id = $1`],

    // Referrals
    ['referrals',           `DELETE FROM referrals WHERE referrer_user_id = $1 OR referred_user_id = $1`],

    // Core content
    ['posts',               `DELETE FROM posts WHERE user_id = $1`],
    ['alerts',              `DELETE FROM alerts WHERE user_id = $1`],

    // Finally the user row itself
    ['users',               `DELETE FROM users WHERE id = $1`],
  ];

  const touched = {};
  for (const [name, sql] of steps) {
    try {
      const r = await run(sql, [uid]);
      if (r && typeof r.rowCount === 'number' && r.rowCount > 0) {
        touched[name] = r.rowCount;
      }
    } catch (err) {
      // Table doesn't exist / column mismatch / constraint we don't
      // know about — record it but don't abort the whole wipe.
      if (!touched.errors) touched.errors = [];
      touched.errors.push({ table: name, message: err && err.message });
    }
  }
  return touched;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  if (STAFF_ROLES.indexOf(caller.role) === -1) {
    return res.status(403).json({ error: 'Admin or moderator role required' });
  }
  // Only admins (not moderators) can run the destructive operation itself.
  if (caller.role !== 'admin') {
    return res.status(403).json({ error: 'Only admin role can run this operation' });
  }

  const body = (await parseBody(req)) || {};
  const dryRun = body.dry_run !== false; // default true for safety

  // Pre-flight counts
  const target = await countTarget();
  const kept = await countKept();
  const stripeRisk = await countStripeRisk();
  const report = {
    dry_run: dryRun,
    counts: {
      target_for_deletion: target,
      kept_admins: kept.admins,
      kept_moderators: kept.mods,
      kept_seed_accounts: kept.seeds,
      total_users_before: kept.total,
      users_with_active_stripe_sub: stripeRisk,
    },
    caller: { id: String(caller.id), email: caller.email, role: caller.role },
    started_at: new Date().toISOString(),
  };

  if (stripeRisk > 0) {
    report.refused = `Refusing: ${stripeRisk} non-admin user(s) have an active Stripe subscription_id. Cancel those subs in Stripe first, or clear the subscription_id column, then retry.`;
    return res.status(409).json(report);
  }

  if (dryRun) {
    report.note = 'Dry run only — no rows deleted. Re-run with { dry_run: false, confirm: "WIPE" } to actually delete.';
    return res.status(200).json(report);
  }

  if (body.confirm !== 'WIPE') {
    report.refused = 'dry_run=false requires body.confirm = "WIPE" (literal string)';
    return res.status(400).json(report);
  }

  // Execute
  const victims = await getMany(
    `SELECT id, email, display_name, role FROM users
     WHERE (role IS NULL OR role NOT IN ('admin','moderator'))
       AND COALESCE(email, '') NOT LIKE '%' || $1`,
    [SEED_EMAIL_SUFFIX]
  );

  report.deleted_users = [];
  report.table_counts = {};
  report.errors = [];

  for (const u of victims) {
    try {
      const touched = await purgeUser(u.id);
      report.deleted_users.push({ id: String(u.id), email: u.email, display_name: u.display_name, role: u.role });
      for (const [table, n] of Object.entries(touched)) {
        if (table === 'errors') {
          for (const e of n) report.errors.push({ user_id: String(u.id), ...e });
        } else {
          report.table_counts[table] = (report.table_counts[table] || 0) + n;
        }
      }
    } catch (err) {
      report.errors.push({ user_id: String(u.id), message: err && err.message });
    }
  }

  report.completed_at = new Date().toISOString();
  report.counts.total_users_after = (await countKept()).total;
  return res.status(200).json(report);
};
