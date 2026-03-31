const bcrypt = require('bcryptjs');
const { getOne, run } = require('../_utils/db');
const { cors, parseBody } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const { token, password } = body;

    if (!token || !password) {
      return res.status(400).json({ error: 'Token and new password are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Find valid token
    const resetToken = await getOne(
      'SELECT * FROM password_reset_tokens WHERE token = $1 AND used = false AND expires_at > NOW()',
      [token]
    );

    if (!resetToken) {
      return res.status(400).json({ error: 'Invalid or expired reset link. Please request a new one.' });
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(password, 12);

    // Update user password
    await run('UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2', [passwordHash, resetToken.user_id]);

    // Mark token as used
    await run('UPDATE password_reset_tokens SET used = true WHERE id = $1', [resetToken.id]);

    return res.status(200).json({ success: true, message: 'Password updated successfully. You can now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
