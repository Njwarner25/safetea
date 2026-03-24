const { authenticate, cors } = require('../../_utils/auth');
const { getOne } = require('../../_utils/db');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(200).json({ unread: 0 });

  try {
    const result = await getOne(
      'SELECT COUNT(*) AS count FROM messages WHERE recipient_id = $1 AND is_read = false',
      [user.id]
    );

    return res.status(200).json({ unread: parseInt(result.count) || 0 });
  } catch (err) {
    return res.status(200).json({ unread: 0 });
  }
};
