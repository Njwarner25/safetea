'use strict';

/**
 * SafeTea Trust Level system — replaces the old hard-lock verification gates.
 *
 * 5 levels (0-4) computed from existing verification columns + connected_accounts.
 * Returns the level, the per-check status, the permissions unlocked at this level,
 * and the user's progress toward the next level.
 *
 * Reusable across rooms, community/city feeds, DMs, Safe Link, and moderation.
 *
 * Usage:
 *   const trust = await getTrustLevel(user);
 *   if (!trust.permissions.canCreatePost) return res.status(403).json(trust.upgradePrompt('canCreatePost'));
 */

const { getOne } = require('./db');

const LEVEL_LABELS = {
  0: 'Visitor',
  1: 'Phone Verified',
  2: 'Identity Light',
  3: 'Trusted User',
  4: 'Fully Verified'
};

// Friendly upgrade prompts — never harsh, always actionable
const UPGRADE_PROMPTS = {
  canEnterRoom:    'Verify your phone number to enter rooms.',
  canReact:        'Verify your phone number to react to posts.',
  canReport:       'Verify your phone number to report posts.',
  canComment:      'Unlock replies by completing Identity Light verification (age + selfie).',
  canCreatePost:   'Unlock posting by becoming a Trusted User (gender + social media).',
  canDM:           'Unlock direct messages by becoming a Trusted User.',
  canModerate:     'Complete full verification (government ID) to access moderator tools.'
};

const HELPER_TEXT =
  'SafeTea uses layered verification to keep community spaces safer while still allowing new users to explore.';

const CHECK_LABELS = {
  phone_verified: 'Phone Verified',
  age_verified: 'Age Verified',
  identity_verified: 'Selfie + Liveness',
  gender_verified: 'Gender Verified',
  social_connected: 'Social Media Connected',
  didit_verified: 'Government ID',
  face_match: 'Face Match'
};

// Order matters — this is the order shown in the checklist UI
const CHECK_ORDER = ['phone_verified', 'age_verified', 'identity_verified', 'gender_verified', 'social_connected', 'didit_verified', 'face_match'];

// Each level's required checks (cumulative)
const LEVEL_REQUIREMENTS = {
  1: ['phone_verified'],
  2: ['phone_verified', 'age_verified', 'identity_verified'],
  3: ['phone_verified', 'age_verified', 'identity_verified', 'gender_verified', 'social_connected'],
  4: ['phone_verified', 'age_verified', 'identity_verified', 'gender_verified', 'social_connected', 'didit_verified', 'face_match']
};

function buildPermissions(level) {
  return {
    canEnterRoom:   level >= 1,
    canReadPosts:   level >= 1,
    canReact:       level >= 1,
    canReport:      level >= 1,
    canComment:     level >= 2,
    canCreatePost:  level >= 3,
    canDM:          level >= 3,
    canModerate:    level >= 4,
    canPreview:     true   // Level 0 can always preview
  };
}

function calculateLevel(checks) {
  if (!checks.phone_verified) return 0;
  if (checks.didit_verified && checks.face_match && checks.social_connected && checks.gender_verified && checks.identity_verified && checks.age_verified) return 4;
  if (checks.social_connected && checks.gender_verified && checks.identity_verified && checks.age_verified) return 3;
  if (checks.identity_verified && checks.age_verified) return 2;
  return 1;
}

/**
 * Build the trust profile from a user object + (optional) social account count.
 * Pure function — no DB. Use this when you've already fetched the data.
 */
function buildTrustProfile(user, socialConnectedCount) {
  const checks = {
    phone_verified:    !!user.phone_verified,
    age_verified:      !!user.age_verified,
    identity_verified: !!user.identity_verified,
    gender_verified:   !!user.gender_verified,
    social_connected:  (socialConnectedCount || 0) >= 1,
    didit_verified:    !!user.didit_verified,
    // Didit's flow IS face match — we don't have a separate face_match column,
    // but didit_verified guarantees both gov ID and face match per their API.
    face_match:        !!user.didit_verified
  };

  const level = calculateLevel(checks);
  const label = LEVEL_LABELS[level];
  const permissions = buildPermissions(level);

  // Progress toward next level
  const nextLevel = level < 4 ? level + 1 : null;
  let progress = null;
  if (nextLevel) {
    const required = LEVEL_REQUIREMENTS[nextLevel];
    const completed = required.filter(function(c) { return checks[c]; }).length;
    progress = {
      next_level: nextLevel,
      next_label: LEVEL_LABELS[nextLevel],
      completed: completed,
      total: required.length,
      missing: required.filter(function(c) { return !checks[c]; }).map(function(c) { return { key: c, label: CHECK_LABELS[c] }; })
    };
  }

  // Checklist for UI rendering
  const checklist = CHECK_ORDER.map(function(key) {
    return { key: key, label: CHECK_LABELS[key], complete: !!checks[key] };
  });

  return {
    level: level,
    label: label,
    checks: checks,
    checklist: checklist,
    permissions: permissions,
    progress: progress,
    helper_text: HELPER_TEXT
  };
}

/**
 * Async version — fetches social account count from DB.
 * Use this in handlers where you have `user.id` and need the trust profile.
 */
async function getTrustLevel(user) {
  if (!user || !user.id) return buildTrustProfile({}, 0);

  let socialCount = 0;
  try {
    const row = await getOne(
      `SELECT COUNT(*)::int AS count FROM connected_accounts WHERE user_id = $1 AND verified = true`,
      [user.id]
    );
    socialCount = (row && row.count) || 0;
  } catch (_) { /* table may not exist on older deploys */ }

  return buildTrustProfile(user, socialCount);
}

/**
 * Build a 403 response body for a gated action. Use this when an endpoint
 * needs to refuse politely.
 */
function gateResponse(actionKey, trust) {
  return {
    error: 'trust_level_insufficient',
    action: actionKey,
    current_level: trust.level,
    current_label: trust.label,
    required_message: UPGRADE_PROMPTS[actionKey] || 'Complete more verification steps to unlock this action.',
    progress: trust.progress,
    helper_text: HELPER_TEXT
  };
}

module.exports = {
  getTrustLevel,
  buildTrustProfile,
  gateResponse,
  LEVEL_LABELS,
  UPGRADE_PROMPTS,
  CHECK_LABELS,
  HELPER_TEXT
};
