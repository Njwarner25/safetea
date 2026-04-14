const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { sendStrikeBanEmail } = require('../../services/email');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  // Admin-only guard
  if (user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }

  // GET /api/admin/ban?user_id=X — Check ban status
  if (req.method === 'GET') {
    try {
      const userId = req.query.user_id;
      if (!userId) return res.status(400).json({ error: 'user_id query param required' });

      const target = await getOne(
        `SELECT id, banned, banned_at, ban_reason, ban_type, ban_until
         FROM users WHERE id = $1`,
        [userId]
      );
      if (!target) return res.status(404).json({ error: 'User not found' });

      return res.status(200).json({
        user_id: userId,
        banned: target.banned || false,
        ban_reason: target.ban_reason || null,
        ban_type: target.ban_type || null,
        banned_at: target.banned_at || null,
        ban_until: target.ban_until || null,
        is_expired: target.ban_until ? new Date(target.ban_until) < new Date() : false,
      });
    } catch (err) {
      console.error('Check ban status error:', err);
      return res.status(500).json({ error: 'Failed to check ban status' });
    }
  }

  // POST /api/admin/ban — Ban or unban a user
  if (req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const { action, user_id, reason, ban_type, duration_days } = body;

      if (!user_id) return res.status(400).json({ error: 'user_id is required' });

      // UNBAN action
      if (action === 'unban') {
        const target = await getOne('SELECT id FROM users WHERE id = $1', [user_id]);
        if (!target) return res.status(404).json({ error: 'User not found' });

        await run(
          `UPDATE users
           SET banned = false, ban_reason = NULL, ban_type = NULL, ban_until = NULL
           WHERE id = $1`,
          [user_id]
        );

        // Unhide posts
        await run('UPDATE posts SET hidden = false WHERE user_id = $1', [user_id]);

        // Send inbox notification to user
        await run(
          `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at)
           VALUES ($1, $1, $2, true, NOW())`,
          [user_id, '✅ Your account has been unsuspended. You can now use SafeTea again. Please review our community guidelines to avoid future issues.']
        );

        return res.status(200).json({ message: 'User unbanned successfully', user_id });
      }

      // BAN action (default)
      // Verify target user exists
      const target = await getOne('SELECT id, role FROM users WHERE id = $1', [user_id]);
      if (!target) return res.status(404).json({ error: 'User not found' });

      // Guard: can't ban yourself
      if (String(user_id) === String(user.id)) {
        return res.status(400).json({ error: 'You cannot ban yourself' });
      }

      // Guard: can't ban other admins
      if (target.role === 'admin') {
        return res.status(403).json({ error: 'You cannot ban other administrators' });
      }

      // Validate ban fields
      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({ error: 'Reason must be at least 10 characters' });
      }
      if (!ban_type || !['temporary', 'permanent'].includes(ban_type)) {
        return res.status(400).json({ error: 'ban_type must be "temporary" or "permanent"' });
      }

      let banUntil = null;
      if (ban_type === 'temporary') {
        if (!duration_days || duration_days <= 0) {
          return res.status(400).json({ error: 'duration_days is required for temporary bans' });
        }
        banUntil = new Date();
        banUntil.setDate(banUntil.getDate() + parseInt(duration_days));
      }

      // Update user
      await run(
        `UPDATE users
         SET banned = true, banned_at = NOW(), ban_reason = $1, ban_type = $2, ban_until = $3
         WHERE id = $4`,
        [reason, ban_type, banUntil, user_id]
      );

      // Hide all user's posts
      await run('UPDATE posts SET hidden = true WHERE user_id = $1', [user_id]);

      // Send inbox notification to user — explain why and that they can still use safety tools
      const banMsg = ban_type === 'permanent'
        ? `🚫 ACCOUNT SUSPENDED — Community Features Restricted\n\nYour account has been permanently suspended from SafeTea community features (posts, chats, rooms).\n\nReason: ${reason}\n\nYou can still use SafeTea's safety tools including Date Check-in, SafeLink, SOS, Red Flag Scanner, and Catfish Scanner.\n\nTo appeal this decision, email support@getsafetea.app with your account email and a detailed explanation. Appeals are reviewed by SafeTea leadership.\n\n— SafeTea Safety Team`
        : `⚠️ ACCOUNT SUSPENDED — Community Features Restricted\n\nYour account has been temporarily suspended from SafeTea community features (posts, chats, rooms) for ${duration_days} day(s).\n\nReason: ${reason}\n\nYour community access will be restored on ${banUntil.toLocaleDateString()}. You can still use SafeTea's safety tools including Date Check-in, SafeLink, SOS, Red Flag Scanner, and Catfish Scanner during this time.\n\nTo appeal this decision, email support@getsafetea.app with your account email and a detailed explanation.\n\n— SafeTea Safety Team`;
      await run(
        `INSERT INTO messages (sender_id, recipient_id, content, is_system, created_at)
         VALUES ($1, $1, $2, true, NOW())`,
        [user_id, banMsg]
      );

      // Send ban notification email (non-blocking)
      const targetUser = await getOne('SELECT email, display_name FROM users WHERE id = $1', [user_id]);
      if (targetUser && targetUser.email) {
        const strikeCount = ban_type === 'permanent' ? 3 : 1;
        sendStrikeBanEmail(targetUser.email, targetUser.display_name, strikeCount, ban_type === 'permanent').catch(function(err) {
          console.error('[Ban] Strike/ban email failed:', err.message);
        });
      }

      return res.status(200).json({
        message: 'User banned successfully',
        ban: {
          user_id,
          ban_type,
          reason,
          banned_at: new Date().toISOString(),
          ban_until: banUntil ? banUntil.toISOString() : null,
          duration_days: duration_days || null,
        },
      });
    } catch (err) {
      console.error('Ban user error:', err);
      return res.status(500).json({ error: 'Failed to process ban action' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
