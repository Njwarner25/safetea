const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  // GET /api/admin/posts — List posts with AI analysis data
  if (req.method === 'GET') {
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 30, 100);
    const offset = (page - 1) * limit;
    const recommendation = req.query.recommendation || '';
    const minScore = parseInt(req.query.min_score) || 0;
    const maxScore = parseInt(req.query.max_score) || 10;

    try {
      let whereClause = 'WHERE 1=1';
      const params = [];
      let paramIndex = 1;

      if (recommendation) {
        whereClause += ` AND p.ai_recommendation = $${paramIndex}`;
        params.push(recommendation);
        paramIndex++;
      }

      if (minScore > 0) {
        whereClause += ` AND p.ai_credibility_score >= $${paramIndex}`;
        params.push(minScore);
        paramIndex++;
      }

      if (maxScore < 10) {
        whereClause += ` AND p.ai_credibility_score <= $${paramIndex}`;
        params.push(maxScore);
        paramIndex++;
      }

      const countResult = await getOne(
        `SELECT COUNT(*) as count FROM posts p ${whereClause}`,
        params
      );

      const posts = await getMany(
        `SELECT p.id, p.user_id, p.title, p.body as content, p.category, p.city, p.feed,
                p.likes, p.hidden, p.is_flagged, p.created_at,
                p.ai_credibility_score, p.ai_flags, p.ai_recommendation,
                p.ai_reasoning, p.ai_analyzed_at,
                u.email, u.display_name, u.avatar_initial, u.avatar_color, u.role as user_role
         FROM posts p
         JOIN users u ON p.user_id = u.id
         ${whereClause}
         ORDER BY p.created_at DESC
         LIMIT $${paramIndex} OFFSET $${paramIndex + 1}`,
        [...params, limit, offset]
      );

      return res.json({
        posts,
        pagination: {
          page,
          limit,
          total: parseInt(countResult.count),
          totalPages: Math.ceil(parseInt(countResult.count) / limit)
        }
      });
    } catch (err) {
      console.error('Admin posts list error:', err);
      return res.status(500).json({ error: 'Failed to load posts' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
