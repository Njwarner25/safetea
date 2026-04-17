const { getMany, getOne, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');
const { sendCityUnlockEmail } = require('../../services/email');

async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Verify cron secret
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error('CRITICAL: CRON_SECRET environment variable is not set.');
    return res.status(500).json({ error: 'CRON_SECRET not configured' });
  }

  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (providedSecret !== cronSecret) {
    console.warn('Unauthorized cron request attempt to unlock-cities');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = {
    timestamp: new Date().toISOString(),
    cities_checked: 0,
    cities_unlocked: 0,
    emails_sent: 0,
    errors: []
  };

  try {
    // Find cities that have hit their threshold
    const readyCities = await getMany(
      `SELECT * FROM city_requests WHERE status = 'pending' AND signup_count >= threshold`
    );

    results.cities_checked = readyCities.length;

    if (readyCities.length === 0) {
      console.log('unlock-cities: No cities ready to unlock.');
      return res.status(200).json({ success: true, message: 'No cities ready to unlock', ...results });
    }

    for (const city of readyCities) {
      try {
        // Insert into active cities table
        const existing = await getOne(
          'SELECT id FROM cities WHERE LOWER(name) = $1',
          [city.city_name.toLowerCase()]
        );

        if (!existing) {
          await run(
            `INSERT INTO cities (name, state, emoji, is_active, slug)
             VALUES ($1, $2, $3, true, $4)`,
            [city.city_name, city.state, city.emoji || '🏙️', city.slug]
          );
        } else {
          await run(
            'UPDATE cities SET is_active = true WHERE id = $1',
            [existing.id]
          );
        }

        // Update city_request status
        await run(
          `UPDATE city_requests SET status = 'unlocked', unlocked_at = NOW() WHERE id = $1`,
          [city.id]
        );

        // Email all signups
        const signups = await getMany(
          'SELECT email FROM city_signups WHERE city_request_id = $1',
          [city.id]
        );

        for (const signup of signups) {
          try {
            await sendCityUnlockEmail(signup.email, city.city_name, city.signup_count);
            results.emails_sent++;
          } catch(e) {
            console.error('unlock-cities: Email send error:', e.message);
          }
        }

        results.cities_unlocked++;
        console.log(`unlock-cities: Unlocked ${city.city_name}, ${city.state} with ${city.signup_count} signups`);

      } catch (cityErr) {
        console.error(`unlock-cities: Error unlocking ${city.city_name}:`, cityErr);
        results.errors.push({ city: city.city_name, error: cityErr.message });
      }
    }

    console.log('unlock-cities: Complete.', JSON.stringify(results));
    return res.status(200).json({ success: true, ...results });

  } catch (err) {
    console.error('unlock-cities: Fatal error:', err);
    return res.status(500).json({
      error: 'Cron job failed',
      message: err.message,
      partial_results: results
    });
  }
};

module.exports = require('../_utils/cron-wrapper').withCronLogging('unlock-cities', handler);
