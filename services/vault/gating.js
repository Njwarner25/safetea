/**
 * Safety Vault is a SafeTea+ paid feature. This helper gates owner-facing
 * endpoints behind an active subscription or an admin/moderator role.
 *
 * The contact portal (`/api/vault/contact-portal/*`) and the public share
 * viewer (`/api/share/[token]`) are NOT gated — the contact is not the
 * paying user; the vault *owner* pays.
 */

const PAID_TIERS = ['plus', 'pro', 'premium'];
const STAFF_ROLES = ['admin', 'moderator'];

function isPlusUser(user) {
  if (!user) return false;
  if (STAFF_ROLES.indexOf(user.role) !== -1) return true;
  return PAID_TIERS.indexOf(user.subscription_tier) !== -1;
}

/**
 * Reject the request with 403 if the authenticated user is not on SafeTea+.
 * Returns true if blocked (caller should return), false if allowed.
 */
function blockIfNotPlus(user, res) {
  if (isPlusUser(user)) return false;
  res.status(403).json({
    error: 'SafeTea+ subscription required',
    upgrade: true,
    message: 'Safety Vault is a SafeTea+ feature ($7.99/mo or $66.99/yr). Upgrade in Settings → Subscription.'
  });
  return true;
}

module.exports = { isPlusUser, blockIfNotPlus };
