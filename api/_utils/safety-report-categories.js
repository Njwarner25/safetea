'use strict';

/**
 * Shared vocabulary for community safety reports — the layer-3 source for
 * GET /api/ai/briefs (see api/ai/briefs.js fetchCommunityReports).
 *
 * Design constraints that keep this surface low-risk and on-tone with the
 * Alessia spec:
 *   - Reports describe an *experience in a place*, never a named individual.
 *     (Naming people is the separate, higher-risk Name Watch surface.)
 *   - The category vocabulary is fixed — no free-form type — so the brief
 *     copy stays calm and predictable.
 *   - Brief copy never says "danger / unsafe / attack / crime is likely";
 *     it prefers "reported", "recent", "consider", "Alessia noticed".
 */

// Allowed report categories. Clients must send one of these keys.
// `noun` is the calm phrase folded into brief copy; `icon` is Font Awesome 6.
const CATEGORIES = {
  followed:      { icon: 'fa-eye',                  noun: 'someone feeling followed' },
  harassment:    { icon: 'fa-comment-slash',        noun: 'harassment' },
  uncomfortable: { icon: 'fa-user',                 noun: 'a person making others uncomfortable' },
  drink_safety:  { icon: 'fa-martini-glass',        noun: 'a drink-safety concern' },
  unsafe_venue:  { icon: 'fa-location-dot',         noun: 'an uncomfortable experience at a venue' },
  aggression:    { icon: 'fa-triangle-exclamation', noun: 'aggressive behavior' },
  other:         { icon: 'fa-circle-info',          noun: 'a safety concern' },
};

function isValidCategory(c) {
  return typeof c === 'string' && Object.prototype.hasOwnProperty.call(CATEGORIES, c);
}

function categoryKeys() {
  return Object.keys(CATEGORIES);
}

/**
 * Build a single calm brief for an aggregated category.
 *   category   — one of CATEGORIES
 *   count      — number of active reports of this category in the window
 *   windowDays — lookback window used, for honest phrasing
 * Returns the { id, type, icon, body, severity, actions } shape the briefs
 * frontend (public/alessia.html) consumes.
 */
function buildCommunityBrief(category, count, windowDays) {
  const meta = CATEGORIES[category] || CATEGORIES.other;
  const many = count >= 2;
  const lead = many
    ? 'Alessia noticed a few recent reports of ' + meta.noun + ' near here'
    : 'Alessia noticed a recent report of ' + meta.noun + ' near here';
  const suggestion = many
    ? 'You might want to share your live location with a trusted contact, or start a Safe Walk if you’re heading out.'
    : 'Trust your instincts, and consider sharing your live location if you’re out alone.';
  const body = lead + ' (within the last ' + windowDays + ' days). '
    + 'Nothing confirmed — just something neighbors flagged. ' + suggestion;

  return {
    id: 'community-' + category,
    type: 'COMMUNITY',
    icon: meta.icon,
    body: body,
    severity: many ? 'low' : 'gentle',
    actions: many ? ['safe_walk', 'share_location', 'dismiss'] : ['share_location', 'dismiss'],
  };
}

module.exports = { CATEGORIES, isValidCategory, categoryKeys, buildCommunityBrief };
