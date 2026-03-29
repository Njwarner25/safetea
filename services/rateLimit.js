const { getOne, run } = require('../api/_utils/db');

/**
 * Simple database-backed rate limiter for Vercel serverless functions.
 * No Redis needed — uses Postgres.
 *
 * Usage:
 *   const { checkRateLimit } = require('../../services/rateLimit');
 *   const limited = await checkRateLimit(userId, 'redflag', 10, 60);
 *   if (limited) return res.status(429).json({ error: 'Too many requests' });
 */

// In-memory fallback for when DB isn't available
const memoryStore = {};

async function ensureTable() {
  try {
    await run(`CREATE TABLE IF NOT EXISTS rate_limits (
      id SERIAL PRIMARY KEY,
      key VARCHAR(255) NOT NULL,
      count INTEGER DEFAULT 1,
      window_start TIMESTAMP DEFAULT NOW(),
      UNIQUE(key)
    )`);
  } catch (e) { /* already exists */ }
}

let tableCreated = false;

/**
 * Check if a request should be rate limited.
 * @param {string} identifier - User ID or IP address
 * @param {string} action - Action name (e.g. 'redflag', 'catfish', 'offender')
 * @param {number} maxRequests - Max requests allowed in the window
 * @param {number} windowSeconds - Time window in seconds
 * @returns {boolean} true if rate limited (should block), false if allowed
 */
async function checkRateLimit(identifier, action, maxRequests, windowSeconds) {
  const key = `${action}:${identifier}`;

  // Try DB-based rate limiting
  try {
    if (!tableCreated) {
      await ensureTable();
      tableCreated = true;
    }

    // Clean expired entries and check current count
    const row = await getOne(
      `SELECT count, window_start FROM rate_limits WHERE key = $1`,
      [key]
    );

    const now = new Date();

    if (!row) {
      // First request — create entry
      await run(
        `INSERT INTO rate_limits (key, count, window_start) VALUES ($1, 1, $2)
         ON CONFLICT (key) DO UPDATE SET count = 1, window_start = $2`,
        [key, now]
      );
      return false;
    }

    const windowStart = new Date(row.window_start);
    const elapsed = (now - windowStart) / 1000;

    if (elapsed > windowSeconds) {
      // Window expired — reset
      await run(
        `UPDATE rate_limits SET count = 1, window_start = $1 WHERE key = $2`,
        [now, key]
      );
      return false;
    }

    if (row.count >= maxRequests) {
      // Rate limited
      return true;
    }

    // Increment counter
    await run(
      `UPDATE rate_limits SET count = count + 1 WHERE key = $1`,
      [key]
    );
    return false;

  } catch (dbErr) {
    // Fallback to in-memory rate limiting if DB fails
    const now = Date.now();
    if (!memoryStore[key]) {
      memoryStore[key] = { count: 1, start: now };
      return false;
    }

    const elapsed = (now - memoryStore[key].start) / 1000;
    if (elapsed > windowSeconds) {
      memoryStore[key] = { count: 1, start: now };
      return false;
    }

    if (memoryStore[key].count >= maxRequests) {
      return true;
    }

    memoryStore[key].count++;
    return false;
  }
}

/**
 * Get IP address from request (works behind Vercel proxy)
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
         req.headers['x-real-ip'] ||
         req.connection?.remoteAddress ||
         'unknown';
}

module.exports = { checkRateLimit, getClientIP };
