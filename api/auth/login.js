const bcrypt = require('bcryptjs');
const { getOne, run } = require('../_utils/db');
const { generateToken, cors, parseBody } = require('../_utils/auth');
const { checkRateLimit, getClientIP } = require('../../services/rateLimit');
const { getClientIp, getUserAgent, getDeviceHash } = require('../_utils/client-info');

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

    try {
        // Rate limit: 10 login attempts per 15 minutes per IP
        const limited = await checkRateLimit(getClientIP(req), 'login', 10, 900);
        if (limited) {
            return res.status(429).json({ error: 'Too many login attempts. Please wait 15 minutes.' });
        }

        const loginIp = getClientIp(req);
        const loginUa = getUserAgent(req);
        const loginDeviceHash = getDeviceHash(req);

        // IP / device ban check — deny before we leak whether an email
        // exists. Admins are exempt so a self-inflicted ban doesn't
        // lock staff out.
        if (loginIp) {
          try {
            const ipBan = await getOne('SELECT id FROM banned_ips WHERE ip = $1', [loginIp]);
            if (ipBan) {
              // Still let admins through — check email before returning.
              const b = await parseBody(req);
              const adm = b && b.email ? await getOne('SELECT role FROM users WHERE email = $1', [String(b.email).toLowerCase()]) : null;
              if (!adm || adm.role !== 'admin') {
                return res.status(403).json({ error: 'Sign-in unavailable from this network.' });
              }
            }
          } catch (_) { /* ban tables may not exist yet */ }
        }
        if (loginDeviceHash) {
          try {
            const devBan = await getOne('SELECT id FROM banned_user_agents WHERE device_hash = $1', [loginDeviceHash]);
            if (devBan) {
              const b = await parseBody(req);
              const adm = b && b.email ? await getOne('SELECT role FROM users WHERE email = $1', [String(b.email).toLowerCase()]) : null;
              if (!adm || adm.role !== 'admin') {
                return res.status(403).json({ error: 'Sign-in unavailable from this device.' });
              }
            }
          } catch (_) { /* ban tables may not exist yet */ }
        }

        const body = await parseBody(req);
        const email = body.email;
        const password = body.password;

        if (!email || !password) {
            return res.status(400).json({ error: 'Email and password are required' });
        }

        const user = await getOne('SELECT * FROM users WHERE email = $1', [email.toLowerCase()]);
        if (!user) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        const validPassword = await bcrypt.compare(password, user.password_hash);
        if (!validPassword) {
            return res.status(401).json({ error: 'Invalid email or password' });
        }

        // Record this successful login's IP + device for audit/forensics.
        try {
          await run(
            'UPDATE users SET last_login_ip = $1, last_login_user_agent = $2, last_login_device_hash = $3, last_login_at = NOW(), login_count = COALESCE(login_count, 0) + 1 WHERE id = $4',
            [loginIp, loginUa, loginDeviceHash, user.id]
          );
        } catch (_) { /* columns may not exist on old deploys */ }

        const token = generateToken(user);
        return res.status(200).json({
            token,
            user: {
                id: user.id,
                email: user.email,
                display_name: user.display_name,
                role: user.role,
                city: user.city,
                subscription_tier: user.subscription_tier,
                avatar_color: user.avatar_color,
                custom_display_name: user.custom_display_name,
                bio: user.bio
            }
        });
    } catch (error) {
        console.error('Login error:', error.message, error.stack);
        return res.status(500).json({ error: 'Login failed: ' + error.message });
    }
};
