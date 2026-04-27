const bcrypt = require('bcryptjs');
const { getOne, run } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');
const { sendWelcomeEmail } = require('../../services/email');
const { checkRateLimit, getClientIP } = require('../../services/rateLimit');
const { getClientIp, getUserAgent, getDeviceHash } = require('../_utils/client-info');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
          // Rate limit: 5 registrations per hour per IP
          const limited = await checkRateLimit(getClientIP(req), 'register', 5, 3600);
          if (limited) {
              return res.status(429).json({ error: 'Too many registration attempts. Please try again later.' });
          }

          // IP / device fingerprint for ban enforcement + audit trail.
          const regIp = getClientIp(req);
          const regUa = getUserAgent(req);
          const regDeviceHash = getDeviceHash(req);

          // Body parsed early so we can capture the attempted email
          // for the audit row even on a banned-IP rejection.
          const body = await parseBody(req);
          const { email, password, display_name, city } = body || {};
          const attemptedEmail = typeof email === 'string' ? email.toLowerCase() : null;

          // Ban check — if this IP or device is banned, silently reject
          // with a generic error so the blocked party doesn't know why.
          // Each rejection writes a row to banned_signup_attempts so the
          // nightly digest can email the admin.
          async function logBlocked(reason) {
            try {
              await run(
                `INSERT INTO banned_signup_attempts (ip, device_hash, user_agent, attempted_email, action, blocked_reason)
                 VALUES ($1, $2, $3, $4, 'register', $5)`,
                [regIp, regDeviceHash, regUa, attemptedEmail, reason]
              );
            } catch (_) { /* table may not exist yet on older deploys */ }
          }
          if (regIp) {
            try {
              const ipBan = await getOne('SELECT id FROM banned_ips WHERE ip = $1', [regIp]);
              if (ipBan) {
                await logBlocked('banned_ip');
                return res.status(403).json({ error: 'Registration unavailable from this network.' });
              }
            } catch (_) { /* table may not exist yet on older deploys */ }
          }
          if (regDeviceHash) {
            try {
              const devBan = await getOne('SELECT id FROM banned_user_agents WHERE device_hash = $1', [regDeviceHash]);
              if (devBan) {
                await logBlocked('banned_device');
                return res.status(403).json({ error: 'Registration unavailable from this device.' });
              }
            } catch (_) { /* table may not exist yet on older deploys */ }
          }

      if (!email || !password || !display_name) {
              return res.status(400).json({ error: 'Email, password, and display name are required' });
      }

      if (password.length < 8) {
              return res.status(400).json({ error: 'Password must be at least 8 characters' });
      }

      const existing = await getOne('SELECT id FROM users WHERE email = $1', [email.toLowerCase()]);
          if (existing) {
                  return res.status(409).json({ error: 'An account with this email already exists' });
          }

      const password_hash = await bcrypt.hash(password, 10);
          // Persist IP/UA/device at registration. Use try/catch so a
          // missing column on an older deploy doesn't block signup.
          try {
            await run(
                  'INSERT INTO users (email, password_hash, display_name, city, registration_ip, registration_user_agent, registration_device_hash) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id',
                  [email.toLowerCase(), password_hash, display_name, city || null, regIp, regUa, regDeviceHash]
                );
          } catch (_) {
            // Fallback for deploys before the migrate-ban-system ran
            await run(
                  'INSERT INTO users (email, password_hash, display_name, city) VALUES ($1, $2, $3, $4) RETURNING id',
                  [email.toLowerCase(), password_hash, display_name, city || null]
                );
          }

      const user = await getOne('SELECT id, email, display_name, role, city FROM users WHERE email = $1', [email.toLowerCase()]);
          const token = generateToken(user);

      // Send welcome email (non-blocking)
      sendWelcomeEmail(user.email, user.display_name).catch(function(err) {
        console.error('[Register] Welcome email failed:', err.message);
      });

      // Enqueue activation sequence: D+1, D+3, D+7, D+14
      // Cron at /api/cron/send-scheduled-emails dispatches them.
      run(
        `INSERT INTO scheduled_emails (user_id, email_type, scheduled_for) VALUES
          ($1, 'activation_day1',  NOW() + INTERVAL '1 day'),
          ($1, 'activation_day3',  NOW() + INTERVAL '3 days'),
          ($1, 'activation_day7',  NOW() + INTERVAL '7 days'),
          ($1, 'activation_day14', NOW() + INTERVAL '14 days')`,
        [user.id]
      ).catch(function(err) {
        console.error('[Register] Enqueue activation sequence failed:', err.message);
      });

      return res.status(201).json({
              token,
              user: {
                        id: user.id,
                        email: user.email,
                        display_name: user.display_name,
                        role: user.role,
                        city: user.city
              }
      });
    } catch (error) {
          console.error('Register error:', error);
          return res.status(500).json({ error: 'Internal server error' });
    }
};
