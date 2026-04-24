/**
 * POST /api/admin/ban-by-user
 *
 * One-shot escalation. Given a user_id:
 *   1. Permanently bans the user account (users.banned = true).
 *   2. Adds their registration_ip AND last_login_ip to banned_ips.
 *   3. Adds their registration_device_hash AND last_login_device_hash
 *      to banned_user_agents.
 *   4. Optionally bans any OTHER non-admin accounts that share the
 *      same IP or device hash (body.include_siblings = true).
 *
 * Body: { user_id: number, reason?: string, include_siblings?: boolean }
 *
 * Admin role required (not moderator).
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

async function banIp(ip, reason, bannedBy) {
  if (!ip) return false;
  try {
    await run(
      `INSERT INTO banned_ips (ip, reason, banned_by) VALUES ($1, $2, $3)
       ON CONFLICT (ip) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by`,
      [ip, reason, bannedBy]
    );
    return true;
  } catch (_) { return false; }
}

async function banDevice(hash, uaSample, reason, bannedBy) {
  if (!hash) return false;
  try {
    await run(
      `INSERT INTO banned_user_agents (device_hash, user_agent_sample, reason, banned_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (device_hash) DO UPDATE SET reason = EXCLUDED.reason, banned_by = EXCLUDED.banned_by`,
      [hash, uaSample, reason, bannedBy]
    );
    return true;
  } catch (_) { return false; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const caller = await authenticate(req);
  if (!caller) return res.status(401).json({ error: 'Unauthorized' });
  if (caller.role !== 'admin') {
    return res.status(403).json({ error: 'Admin role required' });
  }

  const body = (await parseBody(req)) || {};
  const userId = parseInt(body.user_id, 10);
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : 'banned via admin ban-by-user';
  const includeSiblings = body.include_siblings === true;

  if (!Number.isInteger(userId) || userId <= 0) {
    return res.status(400).json({ error: 'user_id required (positive integer)' });
  }

  try {
    const target = await getOne(
      `SELECT id, email, display_name, role,
              registration_ip, registration_user_agent, registration_device_hash,
              last_login_ip, last_login_user_agent, last_login_device_hash
       FROM users WHERE id = $1`,
      [userId]
    );
    if (!target) return res.status(404).json({ error: 'user not found' });
    if (target.role === 'admin' || target.role === 'moderator') {
      return res.status(403).json({ error: 'refusing to ban a staff account' });
    }

    const report = { user_id: userId, email: target.email, actions: {} };

    // 1) Ban the account itself (permanent)
    await run(
      `UPDATE users SET banned = true, ban_type = 'permanent', ban_until = NULL WHERE id = $1`,
      [userId]
    );
    report.actions.user_banned = true;

    // 2) Ban their IPs
    const ipSet = new Set();
    if (target.registration_ip) ipSet.add(target.registration_ip);
    if (target.last_login_ip) ipSet.add(target.last_login_ip);
    report.actions.ips_banned = [];
    for (const ip of ipSet) {
      if (await banIp(ip, reason, caller.id)) report.actions.ips_banned.push(ip);
    }

    // 3) Ban their devices
    const deviceSet = new Set();
    const uaMap = {};
    if (target.registration_device_hash) {
      deviceSet.add(target.registration_device_hash);
      uaMap[target.registration_device_hash] = target.registration_user_agent;
    }
    if (target.last_login_device_hash) {
      deviceSet.add(target.last_login_device_hash);
      uaMap[target.last_login_device_hash] = uaMap[target.last_login_device_hash] || target.last_login_user_agent;
    }
    report.actions.devices_banned = [];
    for (const hash of deviceSet) {
      if (await banDevice(hash, uaMap[hash], reason, caller.id)) report.actions.devices_banned.push(hash);
    }

    // 4) Optional: ban sibling accounts on the same IP or device
    if (includeSiblings && (ipSet.size > 0 || deviceSet.size > 0)) {
      const ipArr = Array.from(ipSet);
      const devArr = Array.from(deviceSet);
      const siblings = await getMany(
        `SELECT id, email, display_name FROM users
         WHERE id <> $1
           AND (role IS NULL OR role NOT IN ('admin','moderator'))
           AND COALESCE(email,'') NOT LIKE '%@seed.safetea.local'
           AND (registration_ip = ANY($2::text[])
             OR last_login_ip = ANY($2::text[])
             OR registration_device_hash = ANY($3::text[])
             OR last_login_device_hash = ANY($3::text[]))`,
        [userId, ipArr.length ? ipArr : [''], devArr.length ? devArr : ['']]
      );
      report.actions.sibling_accounts_banned = [];
      for (const s of siblings) {
        await run(`UPDATE users SET banned = true, ban_type = 'permanent', ban_until = NULL WHERE id = $1`, [s.id]);
        report.actions.sibling_accounts_banned.push({ id: String(s.id), email: s.email, display_name: s.display_name });
      }
    }

    return res.status(200).json(report);
  } catch (err) {
    console.error('[admin/ban-by-user]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
