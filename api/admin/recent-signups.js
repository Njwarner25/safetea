'use strict';

/**
 * GET /api/admin/recent-signups
 *
 * Returns the last N user signups in chronological order, with masked email
 * + IP/device fingerprint for the admin "who's joining right now" feed.
 *
 * Query params:
 *   - limit: 1-200 (default 50)
 *   - days: 1-90 (default 7) — only signups within last N days
 *
 * Auth: admin role only.
 */

const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

function maskEmail(email) {
  if (!email) return null;
  const at = email.indexOf('@');
  if (at <= 1) return email;
  const local = email.slice(0, at);
  const domain = email.slice(at);
  if (local.length <= 2) return local[0] + '***' + domain;
  return local.slice(0, 2) + '***' + local.slice(-1) + domain;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const limit = Math.min(200, Math.max(1, parseInt(req.query.limit) || 50));
  const days  = Math.min(90,  Math.max(1, parseInt(req.query.days)  || 7));

  try {
    const rows = await getMany(
      `SELECT id, display_name, email, city, registration_ip, created_at,
              identity_verified, phone_verified, age_verified, gender_verified,
              didit_verified, trust_score, role, banned, subscription_tier
       FROM users
       WHERE created_at >= NOW() - ($1 || ' days')::interval
         AND COALESCE(email, '') NOT LIKE '%@seed.safetea.local'
       ORDER BY created_at DESC
       LIMIT $2`,
      [String(days), limit]
    );

    const signups = rows.map(function(r) {
      return {
        id: r.id,
        display_name: r.display_name,
        email_masked: maskEmail(r.email),
        city: r.city,
        registration_ip: r.registration_ip,
        created_at: r.created_at,
        trust_score: r.trust_score || 0,
        subscription_tier: r.subscription_tier || 'free',
        role: r.role || 'member',
        banned: !!r.banned,
        verified: {
          phone:    !!r.phone_verified,
          age:      !!r.age_verified,
          identity: !!r.identity_verified,
          gender:   !!r.gender_verified,
          didit:    !!r.didit_verified
        }
      };
    });

    return res.status(200).json({ signups: signups, count: signups.length, days: days });
  } catch (err) {
    console.error('[admin/recent-signups]', err.message);
    return res.status(500).json({ error: err.message });
  }
};
