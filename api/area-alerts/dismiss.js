/**
 * POST /api/area-alerts/dismiss
 * Body: { alert_history_id, action }
 *   action ∈ { 'dismissed', 'im_ok', 'shared_location', 'started_timer', 'opened_sos' }
 *
 * Marks the corresponding user_alert_history row as opened + records
 * the user's chosen action so we can measure which CTAs convert.
 */

'use strict';

const { authenticate, cors, parseBody } = require('../_utils/auth');
const { getOne, run } = require('../_utils/db');

const VALID_ACTIONS = new Set(['dismissed', 'im_ok', 'shared_location', 'started_timer', 'opened_sos']);

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const body = (await parseBody(req)) || {};
  const id = parseInt(body.alert_history_id, 10);
  const action = typeof body.action === 'string' ? body.action : 'dismissed';
  if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'alert_history_id required' });
  if (!VALID_ACTIONS.has(action)) return res.status(400).json({ error: 'invalid action' });

  try {
    const row = await getOne(
      `SELECT id, user_id FROM user_alert_history WHERE id = $1`,
      [id]
    );
    if (!row || String(row.user_id) !== String(user.id)) {
      return res.status(404).json({ error: 'Alert not found' });
    }
    await run(
      `UPDATE user_alert_history
       SET opened_at = COALESCE(opened_at, NOW()),
           action_taken = $1,
           dismissed = ($1 = 'dismissed' OR $1 = 'im_ok')
       WHERE id = $2`,
      [action, id]
    );
    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[area-alerts/dismiss]', err && err.message);
    return res.status(500).json({ error: err && err.message });
  }
};
