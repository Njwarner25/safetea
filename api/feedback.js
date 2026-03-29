const { authenticate, cors, parseBody } = require('./_utils/auth');
const { getOne, getMany, run } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Ensure table exists
  try {
    await run(`CREATE TABLE IF NOT EXISTS feedback (
      id SERIAL PRIMARY KEY,
      user_id INTEGER REFERENCES users(id),
      type VARCHAR(20) DEFAULT 'feedback',
      message TEXT NOT NULL,
      status VARCHAR(20) DEFAULT 'new',
      created_at TIMESTAMP DEFAULT NOW()
    )`);
  } catch (e) { /* already exists */ }

  // GET: List feedback (admin only)
  if (req.method === 'GET') {
    if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });
    try {
      const items = await getMany(
        `SELECT f.*, u.display_name, u.email FROM feedback f
         LEFT JOIN users u ON u.id = f.user_id
         ORDER BY f.created_at DESC LIMIT 100`
      );
      return res.status(200).json({ feedback: items });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to load feedback' });
    }
  }

  // POST: Submit feedback
  if (req.method === 'POST') {
    const body = await parseBody(req);
    const message = (body.message || '').trim();
    const type = body.type || 'feedback';

    if (!message || message.length < 5) {
      return res.status(400).json({ error: 'Feedback must be at least 5 characters' });
    }
    if (message.length > 2000) {
      return res.status(400).json({ error: 'Feedback must be under 2000 characters' });
    }

    try {
      await run(
        'INSERT INTO feedback (user_id, type, message) VALUES ($1, $2, $3)',
        [user.id, type, message]
      );
      return res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
    } catch (err) {
      return res.status(500).json({ error: 'Failed to submit feedback' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
