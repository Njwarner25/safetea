/**
 * GET /api/admin/suspicious-signups
 *
 * Lists recent non-verified signups with their captured IP + device
 * hash so the admin can identify idea-scraping accounts and group
 * them by shared fingerprint.
 *
 * Query params:
 *   hours  = how far back to look (default 168 / 7 days, max 720)
 *   limit  = max rows (default 200, max 1000)
 *
 * Returns three views:
 *   1) individuals — one row per user with all captured signals
 *   2) by_ip       — IPs ranked by number of non-verified accounts
 *   3) by_device   — device hashes ranked the same way
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  if (caller.role !== 'admin' && caller.role !== 'moderator') {
    return res.status(403).json({ error: 'Admin or moderator role required' });
  }

  const hours = Math.min(720, Math.max(1, parseInt(req.query.hours, 10) || 168));
  const limit = Math.min(1000, Math.max(1, parseInt(req.query.limit, 10) || 200));

  try {
    const individuals = await getMany(
      `SELECT id, email, display_name, role, city,
              identity_verified, banned, ban_type,
              registration_ip, registration_user_agent, registration_device_hash,
              last_login_ip, last_login_user_agent, last_login_device_hash,
              last_login_at, login_count, created_at
       FROM users
       WHERE (role IS NULL OR role = 'member')
         AND COALESCE(email, '') NOT LIKE '%@seed.safetea.local'
         AND (identity_verified IS NULL OR identity_verified = false)
         AND created_at > NOW() - INTERVAL '1 hour' * $1
       ORDER BY created_at DESC
       LIMIT $2`,
      [hours, limit]
    );

    const byIp = await getMany(
      `SELECT registration_ip AS ip,
              COUNT(*)::int AS signup_count,
              COUNT(*) FILTER (WHERE identity_verified = false OR identity_verified IS NULL)::int AS unverified_count,
              COUNT(*) FILTER (WHERE banned = true)::int AS banned_count,
              MAX(created_at) AS last_signup_at,
              ARRAY_AGG(DISTINCT email) AS emails
       FROM users
       WHERE registration_ip IS NOT NULL
         AND (role IS NULL OR role = 'member')
         AND COALESCE(email, '') NOT LIKE '%@seed.safetea.local'
         AND created_at > NOW() - INTERVAL '1 hour' * $1
       GROUP BY registration_ip
       HAVING COUNT(*) > 0
       ORDER BY unverified_count DESC, signup_count DESC
       LIMIT 100`,
      [hours]
    );

    const byDevice = await getMany(
      `SELECT registration_device_hash AS device_hash,
              COUNT(*)::int AS signup_count,
              COUNT(*) FILTER (WHERE identity_verified = false OR identity_verified IS NULL)::int AS unverified_count,
              MAX(created_at) AS last_signup_at,
              MAX(registration_user_agent) AS ua_sample,
              ARRAY_AGG(DISTINCT registration_ip) AS ips,
              ARRAY_AGG(DISTINCT email) AS emails
       FROM users
       WHERE registration_device_hash IS NOT NULL
         AND (role IS NULL OR role = 'member')
         AND COALESCE(email, '') NOT LIKE '%@seed.safetea.local'
         AND created_at > NOW() - INTERVAL '1 hour' * $1
       GROUP BY registration_device_hash
       ORDER BY unverified_count DESC, signup_count DESC
       LIMIT 100`,
      [hours]
    );

    return res.status(200).json({
      window_hours: hours,
      generated_at: new Date().toISOString(),
      individuals,
      by_ip: byIp,
      by_device: byDevice,
    });
  } catch (err) {
    console.error('[admin/suspicious-signups]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
