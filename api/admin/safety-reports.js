/**
 * Admin moderation for community safety reports (the safety_briefs store).
 *
 *   GET  /api/admin/safety-reports?status=active|flagged|removed
 *     Lists reports (newest first) + counts by status for the dashboard.
 *
 *   POST /api/admin/safety-reports  { id, action }
 *     action ∈ remove | flag | restore  →  status removed | flagged | active.
 *     Soft status only — rows are retained (legal-hold friendly), never
 *     hard-deleted here. Records moderated_by / moderated_at for the audit
 *     trail. Only 'active' rows surface in /api/ai/briefs.
 *
 * Admin JWT required (user.role === 'admin').
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, getMany, run } = require('../_utils/db');
const { ensureSafetyBriefsSchema } = require('../_utils/safety-briefs-schema');

const ACTION_TO_STATUS = { remove: 'removed', flag: 'flagged', restore: 'active' };
const STATUSES = ['active', 'flagged', 'removed'];

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  if (user.role !== 'admin') return res.status(403).json({ error: 'Admin access required' });

  try {
    await ensureSafetyBriefsSchema(run);

    if (req.method === 'GET') {
      const status = (req.query.status || '').trim();
      const limit = Math.min(parseInt(req.query.limit, 10) || 100, 200);
      const params = [];
      let where = 'WHERE 1=1';
      if (STATUSES.includes(status)) {
        params.push(status);
        where += ` AND sb.status = $${params.length}`;
      }
      params.push(limit);

      const reports = await getMany(
        `SELECT sb.id, sb.category, sb.note, sb.latitude, sb.longitude, sb.city,
                sb.status, sb.created_at, sb.moderated_at, sb.user_id,
                u.email, u.display_name
           FROM safety_briefs sb
           LEFT JOIN users u ON u.id = sb.user_id
           ${where}
           ORDER BY sb.created_at DESC
           LIMIT $${params.length}`,
        params
      );

      const counts = await getMany(`SELECT status, COUNT(*)::int AS n FROM safety_briefs GROUP BY status`);
      const byStatus = { active: 0, flagged: 0, removed: 0 };
      counts.forEach(function (c) { if (c.status in byStatus) byStatus[c.status] = c.n; });

      return res.status(200).json({ reports: reports, counts: byStatus });
    }

    if (req.method === 'POST') {
      const body = await parseBody(req);
      const id = parseInt(body && body.id, 10);
      const newStatus = ACTION_TO_STATUS[body && body.action];
      if (!id || !newStatus) {
        return res.status(400).json({ error: 'id and a valid action (remove|flag|restore) are required' });
      }
      const updated = await getOne(
        `UPDATE safety_briefs
            SET status = $1, moderated_by = $2, moderated_at = NOW()
          WHERE id = $3
          RETURNING id, status`,
        [newStatus, user.id, id]
      );
      if (!updated) return res.status(404).json({ error: 'Report not found' });
      return res.status(200).json({ id: updated.id, status: updated.status });
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err) {
    console.error('[admin/safety-reports]', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }
};
