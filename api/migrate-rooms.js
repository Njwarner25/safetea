const { cors } = require('./_utils/auth');
const { run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (secret !== process.env.MIGRATE_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    // Sorority rooms table
    await run(`CREATE TABLE IF NOT EXISTS sorority_rooms (
      id SERIAL PRIMARY KEY,
      name VARCHAR(100) NOT NULL,
      greek_letters VARCHAR(20) NOT NULL,
      chapter VARCHAR(100),
      university VARCHAR(200),
      scope VARCHAR(20) DEFAULT 'chapter',
      description TEXT,
      color_primary VARCHAR(7) DEFAULT '#E8A0B5',
      color_secondary VARCHAR(7) DEFAULT '#1A1A2E',
      logo_url TEXT,
      invite_code VARCHAR(30) NOT NULL UNIQUE,
      created_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      member_count INTEGER DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Room memberships table
    await run(`CREATE TABLE IF NOT EXISTS room_memberships (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES sorority_rooms(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      role VARCHAR(20) DEFAULT 'member',
      status VARCHAR(20) DEFAULT 'pending',
      muted_until TIMESTAMPTZ,
      requested_at TIMESTAMPTZ DEFAULT NOW(),
      approved_at TIMESTAMPTZ,
      approved_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      UNIQUE(room_id, user_id)
    )`);

    // Room posts table
    await run(`CREATE TABLE IF NOT EXISTS room_posts (
      id SERIAL PRIMARY KEY,
      room_id INTEGER REFERENCES sorority_rooms(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      type VARCHAR(20) DEFAULT 'tea_talk',
      body TEXT NOT NULL,
      photo_id VARCHAR(100),
      pinned BOOLEAN DEFAULT FALSE,
      deleted_by_admin BOOLEAN DEFAULT FALSE,
      deleted_by_ai BOOLEAN DEFAULT FALSE,
      hearts INTEGER DEFAULT 0,
      comment_count INTEGER DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Room post replies
    await run(`CREATE TABLE IF NOT EXISTS room_replies (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES room_posts(id) ON DELETE CASCADE,
      author_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);

    // Room post likes
    await run(`CREATE TABLE IF NOT EXISTS room_post_likes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES room_posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )`);

    // Indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_room_memberships_room ON room_memberships(room_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_room_memberships_user ON room_memberships(user_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_room_posts_room ON room_posts(room_id, created_at DESC)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_room_posts_type ON room_posts(room_id, type)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_room_replies_post ON room_replies(post_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_room_invite ON sorority_rooms(invite_code)`);

    return res.status(200).json({ success: true, message: 'Sorority Rooms tables created' });
  } catch (err) {
    console.error('Rooms migration error:', err);
    return res.status(500).json({ error: 'Migration failed', details: err.message });
  }
};
