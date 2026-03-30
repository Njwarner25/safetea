const { getOne, run } = require('../../_utils/db');
const { authenticate, cors, parseBody } = require('../../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const body = await parseBody(req);
    const { reported_user_id, reason } = body;

    if (!reported_user_id || !reason) {
      return res.status(400).json({ error: 'Reported user ID and reason are required' });
    }

    if (reported_user_id === user.id) {
      return res.status(400).json({ error: 'You cannot report yourself' });
    }

    // Check if reporter already reported this user
    const existing = await getOne(
      'SELECT id FROM gender_reports WHERE reporter_id = $1 AND reported_user_id = $2',
      [user.id, reported_user_id]
    );

    if (existing) {
      return res.status(409).json({ error: 'You have already reported this user' });
    }

    // Insert the report
    await run(
      'INSERT INTO gender_reports (reporter_id, reported_user_id, reason) VALUES ($1, $2, $3)',
      [user.id, reported_user_id, reason]
    );

    // Increment report count on the reported user
    await run(
      'UPDATE users SET gender_report_count = COALESCE(gender_report_count, 0) + 1 WHERE id = $1',
      [reported_user_id]
    );

    // Auto-flag at 3+ unique reporters
    const reportedUser = await getOne(
      'SELECT gender_report_count FROM users WHERE id = $1',
      [reported_user_id]
    );

    if (reportedUser && reportedUser.gender_report_count >= 3) {
      await run(
        'UPDATE users SET gender_verified = false, is_verified = false WHERE id = $1',
        [reported_user_id]
      );
      console.log(`[REPORT] User ${reported_user_id} auto-flagged: ${reportedUser.gender_report_count} reports`);
    }

    return res.status(200).json({
      status: 'reported',
      message: 'Report submitted for review'
    });
  } catch (error) {
    console.error('Gender report error:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
};
