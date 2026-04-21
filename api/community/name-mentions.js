const { getMany } = require('../_utils/db');
const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const user = await authenticate(req);
    if (!user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const fullName = (req.query.fullName || '').trim();
    const city = (req.query.city || '').trim();
    const state = (req.query.state || '').trim();

    if (!fullName || !city) {
      return res.status(400).json({ error: 'fullName and city are required' });
    }

    const posts = await getMany(
      `SELECT p.id, p.content, p.category, p.created_at,
              u.display_name AS author_name,
              UPPER(LEFT(u.display_name, 1)) AS author_initial,
              p.city
       FROM posts p
       JOIN users u ON p.user_id = u.id
       WHERE p.city ILIKE $1
         AND p.is_deleted = false
         AND p.hidden = false
         AND p.content ILIKE $2
       ORDER BY p.created_at DESC
       LIMIT 20`,
      [city, '%' + fullName + '%']
    );

    const mapped = posts.map((p) => ({
      id: String(p.id),
      authorName: p.author_name || 'Anonymous',
      authorInitial: p.author_initial || '?',
      createdAt: p.created_at,
      city: p.city,
      category: p.category || 'tea-talk',
      content: p.content,
      imageUrl: null,
      likesCount: 0,
      commentsCount: 0,
    }));

    // Good Guys category removed 2026-04 — tea-talk only
    const teaTalkCount = mapped.filter((p) => p.category === 'tea-talk').length;

    return res.status(200).json({
      query: {
        fullName,
        city,
        state: state || undefined,
      },
      totalMentions: mapped.length,
      teaTalkCount,
      posts: mapped,
    });
  } catch (error) {
    console.error('Error fetching name mentions:', error);
    return res.status(500).json({ error: 'Failed to fetch community mentions' });
  }
};
