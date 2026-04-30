'use strict';

/**
 * GET /api/users/trust
 *
 * Returns the current user's full trust profile:
 * - level (0-4) and human label
 * - per-check status (which verifications are complete)
 * - permissions unlocked at this level (canEnterRoom, canComment, etc.)
 * - progress toward the next level (X of Y checks complete + missing list)
 * - friendly helper text for UI
 *
 * Used by the dashboard trust card, room headers, and upgrade prompts.
 */

const { authenticate, cors } = require('../_utils/auth');
const { getTrustLevel } = require('../_utils/trust-level');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  try {
    const trust = await getTrustLevel(user);
    return res.status(200).json(trust);
  } catch (err) {
    console.error('[users/trust]', err.message);
    return res.status(500).json({ error: 'Failed to load trust profile' });
  }
};
