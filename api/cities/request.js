const { cors, parseBody, authenticate } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    // Auth optional — capture user_id if logged in
    let user = null;
    try { user = await authenticate(req); } catch(e) {}

    const body = await parseBody(req);
    const { city_name, state, email, referral_code } = body;

    if (!city_name || !state) {
      return res.status(400).json({ error: 'city_name and state are required' });
    }

    const slug = city_name.toLowerCase().trim().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
    if (!slug) {
      return res.status(400).json({ error: 'Invalid city name' });
    }

    // Check if city is already active in the cities table
    const activeCity = await getOne(
      'SELECT id, name FROM cities WHERE LOWER(name) = $1 AND is_active = true',
      [city_name.toLowerCase().trim()]
    );
    if (activeCity) {
      return res.status(200).json({ already_active: true, city: activeCity });
    }

    // Check if city_request already exists for this slug
    let cityRequest = await getOne(
      'SELECT * FROM city_requests WHERE slug = $1',
      [slug]
    );

    if (!cityRequest) {
      // Create new city request
      cityRequest = await getOne(
        `INSERT INTO city_requests (city_name, state, slug, requested_by)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [city_name.trim(), state.trim(), slug, user ? user.id : null]
      );
    }

    // Add signup if email provided
    if (email) {
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

        cityRequest.signup_count = (cityRequest.signup_count || 0) + 1;

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
            console.log('City request referral tracking skipped:', e.message);
          }
        }
      } catch(e) {
        // UNIQUE constraint violation = already signed up, that's fine
        if (e.code !== '23505') throw e;
      }
    }

    return res.status(200).json({
      success: true,
      cityRequest: {
        id: cityRequest.id,
        city_name: cityRequest.city_name,
        state: cityRequest.state,
        slug: cityRequest.slug,
        signup_count: cityRequest.signup_count,
        threshold: cityRequest.threshold,
        status: cityRequest.status
      }
    });
  } catch (err) {
    console.error('City request error:', err);
    return res.status(500).json({ error: 'Failed to request city' });
  }
};
