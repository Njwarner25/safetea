/**
 * GET /api/trial/status
 *
 * Returns the authenticated user's trial state. Auto-downgrades to
 * 'free' if the trial expired and the user doesn't have an active
 * Stripe subscription — so staff tier + paid members are never
 * accidentally flipped.
 *
 * Returns: {
 *   tier: 'free' | 'plus' | 'pro' | 'premium' | 'admin',
 *   is_on_trial: boolean,
 *   trial_expired: boolean,
 *   has_used_trial: boolean,
 *   trial_ends_at: ISO string | null,
 *   days_remaining: number | null,
 *   has_paid_subscription: boolean
 * }
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const PAID_TIERS = ['plus', 'pro', 'premium'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    const row = await getOne(
      `SELECT id, role, subscription_tier, trial_started_at, trial_ends_at,
              has_used_trial, stripe_subscription_id
       FROM users WHERE id = $1`,
      [user.id]
    );
    if (!row) return res.status(404).json({ error: 'User not found' });

    const now = Date.now();
    const trialEndsAt = row.trial_ends_at ? new Date(row.trial_ends_at).getTime() : null;
    const trialExpired = !!(trialEndsAt && trialEndsAt <= now);
    const isOnTrial = !!(trialEndsAt && trialEndsAt > now && row.has_used_trial);
    const hasPaidSubscription = !!row.stripe_subscription_id;

    let effectiveTier = row.subscription_tier || 'free';

    // Auto-downgrade: if trial expired, user is on 'plus' but has no
    // Stripe subscription, flip the tier back to free. Leave
    // trial_started_at / has_used_trial in place — they can't trial
    // again.
    if (trialExpired && !hasPaidSubscription && PAID_TIERS.indexOf(effectiveTier) !== -1) {
      effectiveTier = 'free';
      try {
        await run(
          `UPDATE users SET subscription_tier = 'free', updated_at = NOW() WHERE id = $1`,
          [user.id]
        );
      } catch (_) { /* non-fatal; response still reflects the intent */ }
    }

    // Staff aren't paying customers but shouldn't be "on trial" in the UI.
    if (row.role === 'admin' || row.role === 'moderator') {
      effectiveTier = row.role;
    }

    const daysRemaining = trialEndsAt && trialEndsAt > now
      ? Math.max(0, Math.ceil((trialEndsAt - now) / (24 * 60 * 60 * 1000)))
      : null;

    return res.status(200).json({
      tier: effectiveTier,
      is_on_trial: isOnTrial,
      trial_expired: trialExpired,
      has_used_trial: !!row.has_used_trial,
      trial_ends_at: row.trial_ends_at || null,
      days_remaining: daysRemaining,
      has_paid_subscription: hasPaidSubscription,
    });
  } catch (err) {
    console.error('[trial/status]', err && err.message);
    return res.status(500).json({ error: 'Could not read trial status' });
  }
};
