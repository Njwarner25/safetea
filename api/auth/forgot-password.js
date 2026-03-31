const { getOne, run } = require('../_utils/db');
const { cors, parseBody } = require('../_utils/auth');
const { sendEmail, wrapHtml } = require('../../services/email');
const crypto = require('crypto');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const body = await parseBody(req);
    const email = (body.email || '').toLowerCase().trim();

    if (!email) {
      return res.status(400).json({ error: 'Email is required' });
    }

    // Always return success to prevent email enumeration
    const successMsg = { success: true, message: 'If an account with that email exists, a reset link has been sent.' };

    const user = await getOne('SELECT id, email, display_name FROM users WHERE email = $1', [email]);
    if (!user) {
      return res.status(200).json(successMsg);
    }

    // Generate secure reset token
    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Ensure reset_tokens table exists
    await run(`CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id SERIAL PRIMARY KEY,
      user_id INTEGER NOT NULL,
      token VARCHAR(64) UNIQUE NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used BOOLEAN DEFAULT false,
      created_at TIMESTAMP DEFAULT NOW()
    )`);

    // Invalidate any existing tokens for this user
    await run('UPDATE password_reset_tokens SET used = true WHERE user_id = $1 AND used = false', [user.id]);

    // Store the new token
    await run(
      'INSERT INTO password_reset_tokens (user_id, token, expires_at) VALUES ($1, $2, $3)',
      [user.id, token, expiresAt.toISOString()]
    );

    // Send reset email
    const resetUrl = 'https://getsafetea.app/reset-password?token=' + token;
    await sendEmail({
      to: user.email,
      subject: 'Reset Your SafeTea Password',
      html: wrapHtml(`
        <h2 style="color:#fff;font-size:20px;margin:0 0 16px;">Password Reset</h2>
        <p>Hey ${user.display_name || 'there'}, we received a request to reset your password.</p>
        <div style="text-align:center;margin:24px 0;">
          <a href="${resetUrl}" style="display:inline-block;background:linear-gradient(135deg,#E8A0B5,#D4768E);color:#fff;padding:14px 32px;border-radius:10px;text-decoration:none;font-weight:600;font-size:15px;">Reset Password</a>
        </div>
        <p style="color:#8080A0;font-size:13px;">This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        <p style="color:#666;font-size:11px;margin-top:24px;">If the button doesn't work, copy and paste this URL:<br>${resetUrl}</p>
      `),
      text: 'Reset your SafeTea password: ' + resetUrl
    });

    return res.status(200).json(successMsg);
  } catch (error) {
    console.error('Forgot password error:', error);
    return res.status(500).json({ error: 'Something went wrong. Please try again.' });
  }
};
