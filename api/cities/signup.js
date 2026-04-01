const { cors, parseBody, authenticate } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth optional
    let user = null;
    try { user = await authenticate(req); } catch(e) {}

    const body = await parseBody(req);
    const { slug, email, referral_code } = body;

    if (!slug || !email) {
      return res.status(400).json({ error: 'slug and email are required' });
    }

    // Look up city request by slug
    const cityRequest = await getOne(
      'SELECT * FROM city_requests WHERE slug = $1',
      [slug.toLowerCase().trim()]
    );
    if (!cityRequest) {
      return res.status(404).json({ error: 'City not found' });
    }

    if (cityRequest.status === 'unlocked') {
      return res.status(200).json({ already_unlocked: true, city_name: cityRequest.city_name });
    }

    // Insert signup (UNIQUE constraint prevents duplicates)
    try {
      await run(
        `INSERT INTO city_signups (city_request_id, user_id, email, referral_code)
         VALUES ($1, $2, $3, $4)`,
        [cityRequest.id, user ? user.id : null, email.toLowerCase().trim(), referral_code || null]
      );

      // Increment signup count
      await run(
        'UPDATE city_requests SET signup_count = signup_count + 1 WHERE id = $1',
        [cityRequest.id]
      );
    } catch(e) {
      if (e.code === '23505') {
        return res.status(200).json({ already_signed_up: true, city_name: cityRequest.city_name });
      }
      throw e;
    }

    // Dual-count: if referral_code provided, track the referral
    if (referral_code) {
      try {
        const codeRow = await getOne(
          'SELECT * FROM referral_codes WHERE code = $1',
          [referral_code.trim().toUpperCase()]
        );
        if (codeRow && user && codeRow.user_id !== user.id) {
          const existing = await getOne(
            'SELECT * FROM referrals WHERE referred_user_id = $1',
            [user.id]
          );
          if (!existing) {
            await run(
              `INSERT INTO referrals (referrer_id, referred_user_id, referral_code_id, status)
               VALUES ($1, $2, $3, 'signed_up')`,
              [codeRow.user_id, user.id, codeRow.id]
            );
          }
        }
      } catch(e) {
        console.log('City signup referral tracking skipped:', e.message);
      }
    }

    // Get updated count
    const updated = await getOne(
      'SELECT signup_count, threshold FROM city_requests WHERE id = $1',
      [cityRequest.id]
    );

    return res.status(200).json({
      success: true,
      city_name: cityRequest.city_name,
      signup_count: updated.signup_count,
      threshold: updated.threshold,
      progress: Math.round((updated.signup_count / updated.threshold) * 100)
    });
  } catch (err) {
    console.error('City signup error:', err);
    return res.status(500).json({ error: 'Failed to sign up for city' });
  }
};
