const { getOne } = require('./db');

// Gender values stored during verification (from gender.js)
const ALLOWED_GENDER_VALUES = ['woman', 'trans_woman', 'non_binary', 'female', 'non-binary', 'nonbinary'];

/**
 * Check if a user is allowed to access women-only features (city chat).
 * Queries the DB directly since gender/gender_under_review may not be on the auth user object.
 * @param {object} user - User object with at least .id
 * @returns {Promise<boolean>} true if allowed
 */
async function canAccessCityChat(user) {
  if (!user || !user.id) return false;

  try {
    const row = await getOne(
      'SELECT gender, gender_verified, gender_under_review FROM users WHERE id = $1',
      [user.id]
    );
    if (!row) return false;
    if (row.gender_under_review) return false;

    // If gender column has a value, check it
    if (row.gender) {
      return ALLOWED_GENDER_VALUES.includes(row.gender.toLowerCase().trim());
    }

    // Fallback: if no gender column value but gender_verified is true,
    // they went through the onboarding flow which only allows women/trans_women/non_binary
    return !!row.gender_verified;
  } catch (e) {
    // If gender/gender_under_review columns don't exist yet, fall back to gender_verified only
    try {
      const row = await getOne('SELECT gender_verified FROM users WHERE id = $1', [user.id]);
      return row && !!row.gender_verified;
    } catch (e2) {
      return false;
    }
  }
}

/**
 * Express-style gate — returns 403 if user is not allowed.
 * Call early in the handler. Returns true if blocked (handler should return).
 */
async function enforceCityChatAccess(user, res) {
  const allowed = await canAccessCityChat(user);
  if (!allowed) {
    res.status(403).json({
      error: 'city_chat_restricted',
      message: 'City chat is a women-only safe space. This feature is not available for your account.'
    });
    return true; // blocked
  }
  return false; // allowed
}

module.exports = { canAccessCityChat, enforceCityChatAccess, ALLOWED_GENDER_VALUES };
