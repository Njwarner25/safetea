/**
 * GET /api/admin/cross-post-profiles
 *
 * Returns the list of Buffer "profiles" (one per connected platform). The admin
 * compose UI uses this to populate its platform picker. Returns
 * { configured: false, profiles: [] } if BUFFER_ACCESS_TOKEN is missing so the
 * UI can render a setup hint instead of an error.
 */

const { authenticate, cors } = require('../_utils/auth');
const buffer = require('../../services/buffer-client');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  if (!buffer.isConfigured()) {
    return res.status(200).json({
      configured: false,
      profiles: [],
      hint: 'Set BUFFER_ACCESS_TOKEN in Vercel env to load connected platforms.'
    });
  }

  const result = await buffer.listProfiles();
  if (!result.ok) {
    return res.status(502).json({ configured: true, error: result.error, profiles: [] });
  }

  // Buffer returns an array of profile objects with id, service, formatted_username, avatar.
  const profiles = (result.data || []).map(function (p) {
    return {
      id: p.id,
      service: p.service,                    // 'tiktok', 'instagram', 'twitter', 'threads', etc.
      username: p.formatted_username || p.service_username || '',
      avatar: p.avatar
    };
  });

  return res.status(200).json({ configured: true, profiles });
};
