const { run } = require('./_utils/db');
const { cors } = require('./_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  try {
    // Create post_dislikes table
    await run(`CREATE TABLE IF NOT EXISTS post_dislikes (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )`);

    // Create post_bumps table
    await run(`CREATE TABLE IF NOT EXISTS post_bumps (
      id SERIAL PRIMARY KEY,
      post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
      user_id INTEGER REFERENCES users(id),
      created_at TIMESTAMP DEFAULT NOW(),
      UNIQUE(post_id, user_id)
    )`);

    // Add columns to posts table if they don't exist
    try {
      await run(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS bump_count INTEGER DEFAULT 0`);
    } catch (e) { /* column may already exist */ }

    try {
      await run(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS last_bumped_at TIMESTAMP`);
    } catch (e) { /* column may already exist */ }

    try {
      await run(`ALTER TABLE posts ADD COLUMN IF NOT EXISTS dislike_count INTEGER DEFAULT 0`);
    } catch (e) { /* column may already exist */ }

    return res.status(200).json({
      success: true,
      message: 'Post interactions tables created successfully',
      tables: ['post_dislikes', 'post_bumps'],
      columns: ['posts.bump_count', 'posts.last_bumped_at', 'posts.dislike_count']
    });
  } catch (error) {
    console.error('Migration error:', error);
    return res.status(500).json({ error: 'Migration failed', details: error.message });
  }
};
