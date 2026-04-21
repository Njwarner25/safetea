/**
 * GET /api/vault/resources[?category=...&country=US&state=IL&limit=25]
 *
 * Read-only directory of SafeTea-curated safety resources. Used by:
 *   - Vault UI: show the categorized list
 *   - Journaling Assistant: retrieve-don't-invent pattern. The assistant
 *     calls this endpoint before recommending anything, then surfaces
 *     ONLY what came back. No user input influences the rows — the
 *     table is admin-curated.
 *
 * This endpoint is intentionally permissive (authenticated users can
 * read any active row). There is no sensitive data here; every row is
 * meant to be shared publicly.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { getMany } = require('../_utils/db');

const ALLOWED_CATEGORIES = ['hotline', 'crisis_chat', 'app', 'directory', 'legal_aid', 'shelter'];
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const category = typeof req.query.category === 'string' ? req.query.category : null;
  if (category && ALLOWED_CATEGORIES.indexOf(category) === -1) {
    return res.status(400).json({ error: `category must be one of: ${ALLOWED_CATEGORIES.join(', ')}` });
  }

  const country = typeof req.query.country === 'string' ? req.query.country.toUpperCase().slice(0, 2) : 'US';
  const state = typeof req.query.state === 'string' ? req.query.state.toUpperCase().slice(0, 2) : null;
  const limit = Math.min(MAX_LIMIT, Math.max(1, parseInt(req.query.limit, 10) || DEFAULT_LIMIT));

  try {
    // state filter is inclusive: national rows (state IS NULL) come back
    // alongside state-specific rows.
    const params = [country, limit];
    let stateClause = '';
    if (state) {
      params.push(state);
      stateClause = ` AND (state IS NULL OR state = $${params.length})`;
    }
    let categoryClause = '';
    if (category) {
      params.push(category);
      categoryClause = ` AND category = $${params.length}`;
    }

    const rows = await getMany(
      `SELECT id, category, name, description, url, phone, sms_info,
              country, state, city, tags, sort_order
       FROM vault_resources
       WHERE active = true
         AND country = $1
         ${stateClause}
         ${categoryClause}
       ORDER BY sort_order ASC, name ASC
       LIMIT $2`,
      params
    );

    const resources = rows.map(function (r) {
      return {
        id: String(r.id),
        category: r.category,
        name: r.name,
        description: r.description,
        url: r.url,
        phone: r.phone,
        sms_info: r.sms_info,
        country: r.country,
        state: r.state,
        city: r.city,
        tags: r.tags || [],
      };
    });

    return res.status(200).json({ resources, count: resources.length });
  } catch (err) {
    console.error('[vault/resources] failed:', err);
    return res.status(500).json({ error: 'Failed to load resources' });
  }
};
