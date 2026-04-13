const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

/**
 * Adds the `linking_preferences` column to the users table.
 *
 * Stores a JSON-encoded array of strings (e.g. ["female","trans_woman","non_binary"]).
 * Allowed values are enforced at the API layer.
 *
 * PRIVACY: This field is private to the owner. It must NEVER be returned by
 * /api/users/profile (other users), /api/users/search, or any community/city
 * endpoint. Only /api/users/linking-preferences (authed self) may read it.
 */
module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const results = [];

  try {
    await run(`ALTER TABLE users ADD COLUMN IF NOT EXISTS linking_preferences TEXT`);
    results.push('Added linking_preferences column to users');

    return res.status(200).json({ success: true, results });
  } catch (err) {
    console.error('linking-preferences migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message, results });
  }
};
