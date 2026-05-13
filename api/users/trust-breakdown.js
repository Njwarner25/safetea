'use strict';

/**
 * GET /api/users/trust-breakdown
 *
 * Returns a UI-friendly breakdown of the current user's trust score so the
 * dashboard can show "what you've earned" and "what's missing" with CTAs to
 * the page that unlocks each item.
 *
 * Score model (capped at 100):
 *   phone_verified        +10
 *   identity_verified     +15   (selfie + age verified at signup)
 *   didit_verified        +30   (government ID — the big unlock)
 *   profile_complete      +10   (display_name + city + bio all populated)
 *   avatar_uploaded       +5    (avatar_type === 'photo' OR avatar_url set)
 *   account_age_30d       +10   (created_at older than 30 days)
 *   subscriber            +10   (subscription_tier in plus/pro/premium)
 *   no_violations         +10   (violation_count = 0 AND not flagged AND not banned)
 *   community_posts_3     +10   (>= 3 posts authored)
 *
 * Total possible: 110. We cap returned `score` at 100 so the tier-cap math
 * still resolves cleanly (tier_label is computed from the capped value).
 *
 * Every per-criterion check is wrapped in try/catch: if a table or column
 * is missing on an older deploy, that single item returns earned: false
 * rather than 500-ing the whole response.
 *
 * Public broadcast on SafeLink unlocks at score >= 80 (see api/safelink/start.js).
 */

const { authenticate, cors } = require('../_utils/auth');
const { getOne } = require('../_utils/db');

function tierFromScore(score) {
  if (score <= 30) return 'New';
  if (score <= 59) return 'Building';
  if (score <= 79) return 'Strong';
  return 'Elite';
}

async function safeCheck(fn) {
  try {
    return !!(await fn());
  } catch (_) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  // ── Per-criterion checks (each isolated; never throws upward) ──

  const phoneVerified = await safeCheck(function () {
    return !!user.phone_verified;
  });

  const identityVerified = await safeCheck(function () {
    return !!user.identity_verified;
  });

  const diditVerified = await safeCheck(function () {
    return !!user.didit_verified;
  });

  const profileComplete = await safeCheck(function () {
    var name = (user.custom_display_name || user.display_name || '').trim();
    var city = (user.city || '').trim();
    var bio = (user.bio || '').trim();
    return name.length > 0 && city.length > 0 && bio.length > 0;
  });

  const avatarUploaded = await safeCheck(function () {
    if (user.avatar_type === 'photo') return true;
    if (user.avatar_url && String(user.avatar_url).trim().length > 0) return true;
    return false;
  });

  const accountAge30d = await safeCheck(function () {
    if (!user.created_at) return false;
    var created = new Date(user.created_at).getTime();
    if (!created || isNaN(created)) return false;
    var ageMs = Date.now() - created;
    return ageMs >= 30 * 24 * 60 * 60 * 1000;
  });

  const subscriber = await safeCheck(function () {
    var t = user.subscription_tier;
    return t === 'plus' || t === 'pro' || t === 'premium';
  });

  // no_violations: requires a DB look + user flags
  const noViolations = await safeCheck(async function () {
    if (user.banned) return false;
    // user.warning_count / violation_count may or may not be on the authed object.
    // Re-fetch the columns we need (auth.js doesn't include violation_count/flagged).
    try {
      var row = await getOne(
        'SELECT violation_count, flagged FROM users WHERE id = $1',
        [user.id]
      );
      if (!row) return false;
      if (row.flagged) return false;
      if ((row.violation_count || 0) > 0) return false;
      return true;
    } catch (_) {
      // Columns missing on older deploy — treat as not earned rather than blowing up.
      return false;
    }
  });

  // community_posts_3: count posts authored
  const communityPosts3 = await safeCheck(async function () {
    try {
      var row = await getOne(
        'SELECT COUNT(*)::int AS count FROM posts WHERE user_id = $1',
        [user.id]
      );
      return !!(row && (row.count || 0) >= 3);
    } catch (_) {
      return false;
    }
  });

  // ── Assemble item list (order matters for "top-3 unearned" sorting on FE) ──
  const items = [
    {
      key: 'phone_verified',
      label: 'Phone verified',
      points: 10,
      earned: phoneVerified,
      cta: phoneVerified ? null : { label: 'Verify phone', href: '/onboarding.html' }
    },
    {
      key: 'identity_verified',
      label: 'Selfie + age verified',
      points: 15,
      earned: identityVerified,
      cta: identityVerified ? null : { label: 'Verify selfie', href: '/onboarding.html' }
    },
    {
      key: 'didit_verified',
      label: 'Government ID verified',
      points: 30,
      earned: diditVerified,
      cta: diditVerified ? null : { label: 'Verify identity', href: '/settings.html#verify' }
    },
    {
      key: 'profile_complete',
      label: 'Profile complete (name, city, bio)',
      points: 10,
      earned: profileComplete,
      cta: profileComplete ? null : { label: 'Complete profile', href: '/settings.html' }
    },
    {
      key: 'avatar_uploaded',
      label: 'Profile photo uploaded',
      points: 5,
      earned: avatarUploaded,
      cta: avatarUploaded ? null : { label: 'Upload photo', href: '/settings.html' }
    },
    {
      key: 'account_age_30d',
      label: 'Account active 30+ days',
      points: 10,
      earned: accountAge30d,
      cta: null
    },
    {
      key: 'subscriber',
      label: 'SafeTea+ subscriber',
      points: 10,
      earned: subscriber,
      cta: subscriber ? null : { label: 'Upgrade', href: '/subscribe.html' }
    },
    {
      key: 'no_violations',
      label: 'No moderation violations',
      points: 10,
      earned: noViolations,
      cta: null
    },
    {
      key: 'community_posts_3',
      label: 'Posted 3+ times in community',
      points: 10,
      earned: communityPosts3,
      cta: communityPosts3 ? null : { label: 'Make a post', href: '/dashboard.html#community' }
    }
  ];

  // ── Sum & cap ──
  var rawScore = 0;
  for (var i = 0; i < items.length; i++) {
    if (items[i].earned) rawScore += items[i].points;
  }
  var score = Math.max(0, Math.min(100, rawScore));
  var tierLabel = tierFromScore(score);

  return res.status(200).json({
    score: score,
    max: 100,
    tier_label: tierLabel,
    items: items,
    // The 80-threshold a CTA card uses to motivate users
    public_broadcast_threshold: 80
  });
};
