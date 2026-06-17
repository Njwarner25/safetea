/**
 * Community safety reports — the layer-3 source for /api/ai/briefs.
 *
 *   POST /api/community/safety-report
 *     Body: { category, latitude, longitude, note?, city? }
 *     Files an experience-in-a-place report. Auth required. Screens the
 *     optional note for PII / full names and rejects reports that name a
 *     person or leak contact/address details — this surface is about
 *     places, not people (naming people is the separate Name Watch flow).
 *
 *   GET /api/community/safety-report
 *     Returns the caller's own recent reports (transparency / "my reports").
 *     It intentionally does NOT expose other users' raw reports — those are
 *     only ever surfaced aggregated + anonymized as calm Alessia briefs.
 *
 * Reports are stored in `safety_briefs` (see api/migrate-safety-briefs.js).
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { checkForFullNames } = require('../_utils/check-fullname');
const { isValidCategory, categoryKeys } = require('../_utils/safety-report-categories');
const { ensureSafetyBriefsSchema } = require('../_utils/safety-briefs-schema');

const DAILY_LIMIT = 6;          // reports per user per day (anti-spam)
const NOTE_MAX = 500;

// Structured-PII guards for the free-text note. The note must never carry a
// way to identify or contact a specific person.
const PII_PATTERNS = [
  { key: 'email',   re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/ },
  { key: 'phone',   re: /(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/ },
  { key: 'ssn',     re: /\b\d{3}-\d{2}-\d{4}\b/ },
  { key: 'address', re: /\b\d{1,5}\s+([A-Za-z0-9.'-]+\s){0,3}(st|street|ave|avenue|blvd|boulevard|rd|road|dr|drive|ln|lane|ct|court|way|pl|place|ter|terrace|cir|circle|hwy|highway)\b/i },
];

function detectPII(text) {
  for (const p of PII_PATTERNS) {
    if (p.re.test(text)) return p.key;
  }
  return null;
}

function isBanned(user) {
  if (!user.banned) return false;
  const tempExpired = user.ban_type === 'temporary' && user.ban_until && new Date(user.ban_until) < new Date();
  return !tempExpired;
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  try {
    await ensureSafetyBriefsSchema(run);

    if (req.method === 'GET') {
      const mine = await getMany(
        `SELECT id, category, note, latitude, longitude, city, status, created_at
           FROM safety_briefs
          WHERE user_id = $1
          ORDER BY created_at DESC
          LIMIT 20`,
        [user.id]
      );
      return res.status(200).json({ reports: mine });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    // Suspended users can't seed other people's briefs (anti-abuse), but
    // keep using safety tools elsewhere.
    if (isBanned(user)) {
      return res.status(403).json({
        error: 'account_suspended',
        ban_type: user.ban_type,
        ban_until: user.ban_until || null,
        message: 'Your community access is suspended. You can still use SafeTea safety tools. To appeal, email support@getsafetea.app.',
      });
    }

    const body = await parseBody(req);
    const category = (body && body.category) || '';
    if (!isValidCategory(category)) {
      return res.status(400).json({ error: 'invalid_category', allowed: categoryKeys() });
    }

    const lat = parseFloat(body.latitude);
    const lng = parseFloat(body.longitude);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180) {
      return res.status(400).json({ error: 'latitude and longitude are required valid coordinates' });
    }

    let note = typeof body.note === 'string' ? body.note.trim() : '';
    if (note.length > NOTE_MAX) note = note.slice(0, NOTE_MAX);

    if (note) {
      const piiKind = detectPII(note);
      if (piiKind) {
        return res.status(400).json({
          error: 'pii_detected',
          kind: piiKind,
          message: 'Please remove any contact details or addresses. Reports are about places, not specific people.',
        });
      }
      // Reject notes that name an individual (first + last). Fails open if
      // ANTHROPIC_API_KEY isn't configured — the structured PII guard above
      // still applies.
      try {
        const nameCheck = await checkForFullNames(note);
        if (nameCheck.fullNameDetected) {
          return res.status(400).json({
            error: 'full_name_detected',
            names: nameCheck.detectedNames,
            message: 'Please don’t name a specific person. Describe what happened and where instead.',
          });
        }
      } catch (nameErr) {
        console.error('[safety-report] name check failed, allowing note:', nameErr.message);
      }
    }

    // Per-user daily cap.
    const today = await getOne(
      `SELECT COUNT(*)::int AS n FROM safety_briefs
        WHERE user_id = $1 AND created_at > (CURRENT_DATE)::timestamptz`,
      [user.id]
    );
    if (today && today.n >= DAILY_LIMIT) {
      return res.status(429).json({ error: 'daily_limit', message: 'You’ve reached today’s report limit. Thanks for looking out.' });
    }

    const city = (typeof body.city === 'string' && body.city.trim()) ? body.city.trim().slice(0, 120) : (user.city || null);
    const inserted = await getOne(
      `INSERT INTO safety_briefs (user_id, category, note, latitude, longitude, city, status)
       VALUES ($1, $2, $3, $4, $5, $6, 'active')
       RETURNING id, created_at`,
      [user.id, category, note || null, lat, lng, city]
    );

    return res.status(201).json({
      id: inserted ? inserted.id : null,
      status: 'active',
      message: 'Thanks — your report helps keep the community aware.',
    });
  } catch (err) {
    console.error('[community/safety-report]', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
