/**
 * Migration: Photo Removal Requests & User Strikes
 *
 * Creates tables needed for:
 * - Photo removal request system (users can request removal of photos)
 * - User strike system (tracks violations, auto-suspend at 3 strikes)
 *
 * Run via: GET /api/migrate-photo-removal
 * Requires: Admin authentication
 */

const { authenticate, cors } = require('./_utils/auth');
const { run, getOne } = require('./_utils/db');

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  const results = [];

  try {
    // ─── 1. Photo Removal Requests table ──────────────────────────────
    await run(`
      CREATE TABLE IF NOT EXISTS photo_removal_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        requester_id UUID NOT NULL REFERENCES users(id),
        photo_id UUID REFERENCES photos(id),
        uploaded_photo_data TEXT,
        reason TEXT NOT NULL,
        additional_context TEXT,
        watermark_detected BOOLEAN DEFAULT FALSE,
        watermark_uploader_id UUID REFERENCES users(id),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'reviewing', 'approved', 'denied', 'escalated')),
        reviewer_notes TEXT,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        reviewed_at TIMESTAMPTZ,
        resolved_at TIMESTAMPTZ
      )
    `);
    results.push('photo_removal_requests table: OK');

    // Indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_removal_requests_status ON photo_removal_requests(status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_removal_requests_requester ON photo_removal_requests(requester_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_removal_requests_uploader ON photo_removal_requests(watermark_uploader_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_removal_requests_created ON photo_removal_requests(created_at)`);
    results.push('photo_removal_requests indexes: OK');

    // ─── 2. User Strikes table ────────────────────────────────────────
    await run(`
      CREATE TABLE IF NOT EXISTS user_strikes (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id),
        reason TEXT NOT NULL,
        removal_request_id UUID REFERENCES photo_removal_requests(id),
        status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'applied', 'reversed')),
        applied_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('user_strikes table: OK');

    // Indexes
    await run(`CREATE INDEX IF NOT EXISTS idx_user_strikes_user ON user_strikes(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_strikes_status ON user_strikes(user_id, status)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_user_strikes_request ON user_strikes(removal_request_id)`);
    results.push('user_strikes indexes: OK');

    // ─── 3. Ensure photo_watermarks table exists ──────────────────────
    await run(`
      CREATE TABLE IF NOT EXISTS photo_watermarks (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        photo_id UUID REFERENCES photos(id),
        user_id UUID NOT NULL REFERENCES users(id),
        watermark_hash VARCHAR(64),
        created_at TIMESTAMPTZ DEFAULT NOW()
      )
    `);
    results.push('photo_watermarks table: OK');

    await run(`CREATE INDEX IF NOT EXISTS idx_photo_watermarks_user ON photo_watermarks(user_id)`);
    await run(`CREATE INDEX IF NOT EXISTS idx_photo_watermarks_hash ON photo_watermarks(watermark_hash)`);
    results.push('photo_watermarks indexes: OK');

    // ─── 4. Ensure photos table has required columns ──────────────────
    await run(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS context VARCHAR(50)`);
    await run(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS context_id UUID`);
    await run(`ALTER TABLE photos ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN DEFAULT FALSE`);
    results.push('photos table columns: OK');

    // ─── 5. Add WATERMARK_SECRET env var reminder ─────────────────────
    const hasSecret = !!process.env.WATERMARK_SECRET;
    results.push(`WATERMARK_SECRET env var: ${hasSecret ? 'SET' : 'NOT SET (using dev fallback)'}`);

    return res.status(200).json({
      success: true,
      message: 'Photo removal migration complete',
      results,
    });
  } catch (err) {
    console.error('Migration error:', err);
    return res.status(500).json({
      error: 'Migration failed',
      message: err.message,
      completed: results,
    });
  }
};
