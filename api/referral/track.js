const { cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

// Called when a new user signs up with a referral code
// This is hit from the verify-code.js signup flow
module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { referralCode, newUserId } = body;

    if (!referralCode || !newUserId) {
      return res.status(400).json({ error: 'referralCode and newUserId are required' });
    }

    // Find the referral code
    const codeRow = await getOne(
      'SELECT * FROM referral_codes WHERE code = $1',
      [referralCode.trim().toUpperCase()]
    );
    if (!codeRow) {
      return res.status(404).json({ error: 'Invalid referral code' });
    }

    // Don't let users refer themselves
    if (codeRow.user_id === parseInt(newUserId)) {
      return res.status(400).json({ error: 'Cannot refer yourself' });
    }

    // Check if this user was already referred
    const existing = await getOne(
      'SELECT * FROM referrals WHERE referred_user_id = $1',
      [newUserId]
    );
    if (existing) {
      return res.status(400).json({ error: 'User already has a referrer' });
    }

    // Record the referral
    await run(
      `INSERT INTO referrals (referrer_id, referred_user_id, referral_code_id, status)
       VALUES ($1, $2, $3, 'signed_up')`,
      [codeRow.user_id, newUserId, codeRow.id]
    );

    // Update the referred user's record
    await run(
      'UPDATE users SET referred_by = $1 WHERE id = $2',
      [codeRow.user_id, newUserId]
    );

    // Count total referrals for the referrer
    const count = await getOne(
      'SELECT COUNT(*) as count FROM referrals WHERE referrer_id = $1',
      [codeRow.user_id]
    );

    return res.status(200).json({
      success: true,
      referrerId: codeRow.user_id,
      totalReferrals: parseInt(count.count),
      message: 'Referral tracked successfully',
    });
  } catch (err) {
    console.error('Referral track error:', err);
    return res.status(500).json({ error: 'Failed to track referral' });
  }
};
