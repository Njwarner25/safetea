const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id VARCHAR(100)`);
    results.push('Added stripe_customer_id column');

    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_subscription_id VARCHAR(100)`);
    results.push('Added stripe_subscription_id column');

    return res.status(200).json({
      success: true,
      message: 'Stripe migration complete',
      results,
    });
  } catch (err) {
    return res.status(500).json({ error: 'Migration failed', details: 'See server logs', results });
  }
};
