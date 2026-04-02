const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');
const { logTrustEvent } = require('../_utils/trust-score');
const { sendVerificationRequestEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const admin = await authenticate(req);
  if (!admin) return res.status(401).json({ error: 'Unauthorized' });
  if (admin.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const body = await parseBody(req);
  const { user_id, reason } = body;

  if (!user_id) return res.status(400).json({ error: 'user_id is required' });
  if (!reason || reason.trim().length < 5) return res.status(400).json({ error: 'Reason is required (min 5 characters)' });

  try {
    const targetUser = await getOne(
      'SELECT id, email, display_name, trust_score FROM users WHERE id = $1',
      [user_id]
    );
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Insert verification request
    await run(
      `INSERT INTO verification_requests (user_id, requested_by, reason, status)
       VALUES ($1, $2, $3, 'pending')`,
      [user_id, admin.id, reason.trim()]
    );

    // Send inbox system message
    var msg = 'An admin has requested that you complete additional verification. Reason: ' + reason.trim() + '. Please visit your verification page to comply.';
    try {
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, system_type, created_at)
         VALUES ($1, $2, $3, true, 'verification_request', NOW())`,
        [admin.id, user_id, msg]
      );
    } catch (e) { console.error('[RequestVerify] Inbox message failed:', e.message); }

    // Send email
    if (targetUser.email) {
      sendVerificationRequestEmail(targetUser.email, targetUser.display_name, reason.trim()).catch(function(e) {
        console.error('[RequestVerify] Email failed:', e.message);
      });
    }

    // Log trust event
    await logTrustEvent(user_id, 'verification_requested', targetUser.trust_score || 0, targetUser.trust_score || 0,
      'Admin requested verification: ' + reason.trim(), 'admin', admin.id);

    return res.status(200).json({ success: true, message: 'Verification request sent' });
  } catch (err) {
    console.error('[RequestVerify] Error:', err);
    return res.status(500).json({ error: 'Failed to create verification request' });
  }
};
