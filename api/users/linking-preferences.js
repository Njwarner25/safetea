const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

/**
 * Linking Preferences API
 *
 * Stores the user's PRIVATE preference for which gender identities they are
 * open to linking with on SafeTea. This data is only ever readable by the
 * owner — it must never appear in profile, search, community, or city responses.
 *
 * Double-gate: caller must be BOTH
 *   1. 100% verified  (identity_verified === true AND trust_score >= 70)
 *   2. Paid SafeTea+ member  (subscription_tier in {plus, pro, premium})
 *
 * GET  -> { preferences: string[], gated: boolean, gate: {...} }
 * PUT  -> body { preferences: string[] }   returns same shape on success
 */

const ALLOWED = [
  'female',
  'male',
  'trans_woman',
  'trans_man',
  'non_binary',
  'genderfluid',
  'agender',
  'other'
];

const PAID_TIERS = new Set(['plus', 'pro', 'premium']);
const MIN_TRUST_SCORE = 70;

function checkGate(fullUser) {
  const verified = !!fullUser.identity_verified && (fullUser.trust_score || 0) >= MIN_TRUST_SCORE;
  const paid = PAID_TIERS.has(fullUser.subscription_tier);
  return {
    verified,
    paid,
    allowed: verified && paid,
    min_trust_score: MIN_TRUST_SCORE,
    current_trust_score: fullUser.trust_score || 0
  };
}

function parsePreferences(raw) {
  if (!raw) return [];
  if (Array.isArray(raw)) return raw;
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const authedUser = await authenticate(req);
  if (!authedUser) return res.status(401).json({ error: 'Unauthorized' });

  // Re-fetch the columns we need for the gate (authenticate() only returns a subset)
  const fullUser = await getOne(
    `SELECT id, subscription_tier, identity_verified, trust_score, linking_preferences
     FROM users WHERE id = $1`,
    [authedUser.id]
  );
  if (!fullUser) return res.status(401).json({ error: 'Unauthorized' });

  const gate = checkGate(fullUser);

  if (req.method === 'GET') {
    if (!gate.allowed) {
      return res.status(403).json({
        error: 'feature_locked',
        gate,
        preferences: []
      });
    }
    return res.status(200).json({
      preferences: parsePreferences(fullUser.linking_preferences),
      gate,
      allowed_options: ALLOWED
    });
  }

  if (req.method === 'PUT') {
    if (!gate.allowed) {
      return res.status(403).json({ error: 'feature_locked', gate });
    }

    const body = await parseBody(req);
    const incoming = body && body.preferences;

    if (!Array.isArray(incoming)) {
      return res.status(400).json({ error: 'preferences must be an array' });
    }
    if (incoming.length > ALLOWED.length) {
      return res.status(400).json({ error: 'too many preferences' });
    }

    // Whitelist + dedupe
    const cleaned = [];
    const seen = new Set();
    for (const item of incoming) {
      if (typeof item !== 'string') continue;
      const v = item.trim().toLowerCase();
      if (!ALLOWED.includes(v)) {
        return res.status(400).json({ error: 'invalid preference: ' + item });
      }
      if (seen.has(v)) continue;
      seen.add(v);
      cleaned.push(v);
    }

    try {
      await run(
        `UPDATE users SET linking_preferences = $1, updated_at = NOW() WHERE id = $2`,
        [JSON.stringify(cleaned), authedUser.id]
      );
    } catch (err) {
      // Fallback if `updated_at` column does not exist on users
      try {
        await run(
          `UPDATE users SET linking_preferences = $1 WHERE id = $2`,
          [JSON.stringify(cleaned), authedUser.id]
        );
      } catch (e2) {
        console.error('linking-preferences update failed:', e2);
        return res.status(500).json({ error: 'Failed to save preferences' });
      }
    }

    return res.status(200).json({
      preferences: cleaned,
      gate,
      allowed_options: ALLOWED
    });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
