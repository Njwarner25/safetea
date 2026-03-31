const { run, getOne } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];

  try {
    await run(`
      CREATE TABLE IF NOT EXISTS date_checkouts (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        date_name TEXT,
        date_photo_url TEXT,
        venue_name TEXT,
        venue_address TEXT,
        venue_lat DOUBLE PRECISION,
        venue_lng DOUBLE PRECISION,
        transportation TEXT,
        transport_details TEXT,
        scheduled_time TIMESTAMPTZ,
        estimated_return TIMESTAMPTZ,
        notes TEXT,
        share_code TEXT UNIQUE,
        status TEXT DEFAULT 'checked_out',
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('date_checkouts: OK');

    await run(`
      CREATE TABLE IF NOT EXISTS date_trusted_contacts (
        id SERIAL PRIMARY KEY,
        checkout_id INTEGER REFERENCES date_checkouts(id) ON DELETE CASCADE,
        contact_name TEXT,
        contact_phone TEXT,
        notified BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('date_trusted_contacts: OK');

    const wnCheck = await getOne(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'watched_names' AND column_name = 'user_id'
    `);
    if (wnCheck && wnCheck.data_type === 'integer') {
      await run('DROP TABLE IF EXISTS name_watch_matches');
      await run('DROP TABLE IF EXISTS watched_names');
      results.push('watched_names: dropped old INTEGER tables');
    }

    await run(`
      CREATE TABLE IF NOT EXISTS watched_names (
        id SERIAL PRIMARY KEY,
        user_id TEXT NOT NULL,
        name VARCHAR(100) NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('watched_names: OK');

    await run(`
      CREATE TABLE IF NOT EXISTS name_watch_matches (
        id SERIAL PRIMARY KEY,
        watched_name_id INTEGER NOT NULL,
        post_id INTEGER NOT NULL,
        matched_name VARCHAR(100),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('name_watch_matches: OK');

    await run(`
      CREATE TABLE IF NOT EXISTS redflag_scans (
        id TEXT PRIMARY KEY,
        user_id TEXT,
        search_name TEXT,
        search_city TEXT,
        risk_score INTEGER,
        overall_risk TEXT,
        posts_found INTEGER,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('redflag_scans: OK');

    await run(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id SERIAL PRIMARY KEY,
        post_id INTEGER NOT NULL,
        user_id TEXT NOT NULL,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(post_id, user_id)
      )
    `);
    results.push('post_likes: OK');

    const adminUpdate = await run(
      "UPDATE users SET role = 'admin' WHERE email = 'admin@getsafetea.app'"
    );
    results.push('admin role set: OK');

    return res.status(200).json({ success: true, results });
  } catch (err) {
    return res.status(500).json({ error: err.message, results });
  }
};
