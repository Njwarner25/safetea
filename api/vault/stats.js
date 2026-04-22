/**
 * GET /api/vault/stats
 *
 * Lightweight aggregate counts for the Tools-tab Safety Vault card.
 * Returns total entries, photo count, audio count, and whether the
 * owner has any trusted contacts configured (Guardian yes/no).
 *
 * Gated behind SafeTea+ like every other owner vault endpoint.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne } = require('../_utils/db');
const { blockIfNotPlus } = require('../../services/vault/gating');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (blockIfNotPlus(user, res)) return;

  try {
    const stats = await getOne(
      `SELECT
        COALESCE((SELECT COUNT(*) FROM vault_entries e
                  JOIN vault_folders f ON f.id = e.folder_id
                  WHERE f.owner_user_id = $1 AND e.deleted_at IS NULL), 0) AS entries,
        COALESCE((SELECT COUNT(*) FROM vault_files vf
                  JOIN vault_folders f ON f.id = vf.folder_id
                  WHERE f.owner_user_id = $1 AND vf.deleted_at IS NULL
                    AND vf.mime_type LIKE 'image/%'), 0) AS photos,
        COALESCE((SELECT COUNT(*) FROM vault_files vf
                  JOIN vault_folders f ON f.id = vf.folder_id
                  WHERE f.owner_user_id = $1 AND vf.deleted_at IS NULL
                    AND vf.mime_type LIKE 'audio/%'), 0) AS audio,
        COALESCE((SELECT COUNT(*) FROM vault_files vf
                  JOIN vault_folders f ON f.id = vf.folder_id
                  WHERE f.owner_user_id = $1 AND vf.deleted_at IS NULL
                    AND vf.mime_type LIKE 'video/%'), 0) AS video,
        COALESCE((SELECT COUNT(*) FROM vault_trusted_contacts
                  WHERE owner_user_id = $1 AND status IN ('invited','verified','active')), 0) AS contact_count
      `,
      [user.id]
    );

    return res.status(200).json({
      entries: Number(stats.entries) || 0,
      photos: Number(stats.photos) || 0,
      audio: Number(stats.audio) || 0,
      video: Number(stats.video) || 0,
      guardian: Number(stats.contact_count) > 0 ? 'Set' : 'None',
    });
  } catch (err) {
    console.error('[vault/stats] failed:', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
