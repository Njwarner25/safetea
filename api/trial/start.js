/**
 * POST /api/trial/start
 *
 * Starts a 7-day SafeTea+ free trial for the authenticated user.
 *
 * Guards:
 *   - User must be signed in
 *   - Refuse if has_used_trial is already true
 *   - Refuse if user has an active Stripe subscription
 *   - Refuse if subscription_tier is already plus/pro/premium and has_used_trial=false
 *     AND trial_ends_at > NOW() (trial already running)
 *
 * Side effects:
 *   - Sets subscription_tier = 'plus'
 *   - trial_started_at = NOW()
 *   - trial_ends_at = NOW() + 7 days
 *   - has_used_trial = true
 *
 * Returns: { success, message, trial_ends_at, tier, days_remaining }
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const TRIAL_DAYS = 7;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Sign in to start your trial' });

  try {
    const current = await getOne(
      `SELECT id, subscription_tier, trial_started_at, trial_ends_at, has_used_trial,
              stripe_subscription_id
       FROM users WHERE id = $1`,
      [user.id]
    );
    if (!current) return res.status(404).json({ error: 'User not found' });

    if (current.has_used_trial) {
      return res.status(409).json({
        error: 'You have already used your free trial',
        has_used_trial: true,
      });
    }
    if (current.stripe_subscription_id) {
      return res.status(409).json({
        error: 'You already have a paid subscription',
        has_paid_subscription: true,
      });
    }

    const trialEnd = new Date(Date.now() + TRIAL_DAYS * 24 * 60 * 60 * 1000);

    await run(
      `UPDATE users
       SET subscription_tier = 'plus',
           trial_started_at = NOW(),
           trial_ends_at = $1,
           has_used_trial = TRUE,
           updated_at = NOW()
       WHERE id = $2`,
      [trialEnd.toISOString(), user.id]
    );

    return res.status(200).json({
      success: true,
      message: 'Your 7-day SafeTea+ free trial has started.',
      tier: 'plus',
      trial_ends_at: trialEnd.toISOString(),
      days_remaining: TRIAL_DAYS,
    });
  } catch (err) {
    console.error('[trial/start]', err && err.message);
    return res.status(500).json({ error: 'Could not start trial', details: err && err.message });
  }
};
