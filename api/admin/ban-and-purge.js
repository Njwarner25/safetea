/**
 * POST /api/admin/ban-and-purge
 *
 * Atomic per-user: capture IP + device → ban them in
 * banned_ips / banned_user_agents → delete the user row + cascades.
 *
 * Use when you want both:
 *   - This account gone from the DB.
 *   - Any future signup or login attempt from the same IP / device
 *     blocked AND logged to banned_signup_attempts (which the
 *     nightly cron emails to njwarner25@gmail.com).
 *
 * Body: { user_ids: number[], reason?: string }
 *
 * Refuses to touch admin or moderator accounts. Skips and reports
 * any user_id that isn't found.
 *
 * Admin role required.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

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

async function deleteUserCascade(userId) {
  // Mirror api/admin/delete-user.js — explicit deletes for tables
  // without ON DELETE CASCADE, then the user row.
  await run('DELETE FROM replies WHERE user_id = $1', [userId]);
  await run('DELETE FROM replies WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [userId]);
  await run('DELETE FROM post_likes WHERE post_id IN (SELECT id FROM posts WHERE user_id = $1)', [userId]);
  await run('DELETE FROM posts WHERE user_id = $1', [userId]);
  await run('DELETE FROM alerts WHERE user_id = $1', [userId]);
  await run('DELETE FROM user_city_votes WHERE user_id = $1', [userId]);
  await run('DELETE FROM users WHERE id = $1', [userId]);
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
  const userIds = Array.isArray(body.user_ids)
    ? body.user_ids.map(function (n) { return parseInt(n, 10); }).filter(function (n) { return Number.isInteger(n) && n > 0; })
    : [];
  const reason = typeof body.reason === 'string' ? body.reason.slice(0, 1000) : 'banned and purged via admin';

  if (userIds.length === 0) {
    return res.status(400).json({ error: 'user_ids[] required (positive integers)' });
  }
  if (userIds.length > 50) {
    return res.status(400).json({ error: 'Refusing more than 50 user_ids in one request' });
  }

  const report = { caller_id: caller.id, reason: reason, processed: [] };

  for (const userId of userIds) {
    const item = { user_id: userId };
    try {
      const target = await getOne(
        `SELECT id, email, display_name, role,
                registration_ip, registration_user_agent, registration_device_hash,
                last_login_ip, last_login_user_agent, last_login_device_hash
         FROM users WHERE id = $1`,
        [userId]
      );

      if (!target) {
        item.status = 'not_found';
        report.processed.push(item);
        continue;
      }
      if (target.role === 'admin' || target.role === 'moderator') {
        item.status = 'skipped_staff';
        item.role = target.role;
        report.processed.push(item);
        continue;
      }
      if (caller.id === target.id) {
        item.status = 'skipped_self';
        report.processed.push(item);
        continue;
      }

      item.email = target.email;
      item.display_name = target.display_name;

      // 1) Ban IPs
      const ipSet = new Set();
      if (target.registration_ip) ipSet.add(target.registration_ip);
      if (target.last_login_ip) ipSet.add(target.last_login_ip);
      item.ips_banned = [];
      for (const ip of ipSet) {
        if (await banIp(ip, reason, caller.id)) item.ips_banned.push(ip);
      }

      // 2) Ban devices
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
      item.devices_banned = [];
      for (const hash of deviceSet) {
        if (await banDevice(hash, uaMap[hash], reason, caller.id)) item.devices_banned.push(hash);
      }

      // 3) Delete user with cascades
      await deleteUserCascade(userId);
      item.status = 'banned_and_deleted';
    } catch (err) {
      item.status = 'error';
      item.error = err && err.message;
      console.error('[admin/ban-and-purge] user_id=' + userId, err && err.message);
    }
    report.processed.push(item);
  }

  const counts = report.processed.reduce(function (acc, it) {
    acc[it.status] = (acc[it.status] || 0) + 1;
    return acc;
  }, {});
  report.counts = counts;

  return res.status(200).json(report);
};
