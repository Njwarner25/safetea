/**
 * POST /api/admin/fix-cities
 * Auth: admin user JWT (Authorization: Bearer ...) OR x-cron-secret = $CRON_SECRET
 *
 * Restores the canonical 8-city list to the cities + city_votes tables:
 *   1=Chicago, 2=New York, 3=Los Angeles, 4=Houston, 5=Miami, 6=Atlanta, 7=Dallas, 8=Philadelphia
 *
 * Idempotent. Sets is_active=true for those 8, is_active=false on every other row,
 * and inserts any missing rows with the canonical id. Also keeps both tables in
 * sync since /api/cities.js queries city_votes and /api/cities/* may query cities.
 */

'use strict';

const { authenticate, cors } = require('../_utils/auth');
const { run, getMany, getOne } = require('../_utils/db');

const CANONICAL = [
  { id: 1, name: 'Chicago',      state: 'IL', slug: 'chicago' },
  { id: 2, name: 'New York',     state: 'NY', slug: 'newyork' },
  { id: 3, name: 'Los Angeles',  state: 'CA', slug: 'losangeles' },
  { id: 4, name: 'Houston',      state: 'TX', slug: 'houston' },
  { id: 5, name: 'Miami',        state: 'FL', slug: 'miami' },
  { id: 6, name: 'Atlanta',      state: 'GA', slug: 'atlanta' },
  { id: 7, name: 'Dallas',       state: 'TX', slug: 'dallas' },
  { id: 8, name: 'Philadelphia', state: 'PA', slug: 'philadelphia' },
];

async function tableExists(name) {
  try {
    const row = await getOne(
      `SELECT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=$1) AS exists`,
      [name]
    );
    return !!(row && row.exists);
  } catch (e) { return false; }
}

async function columnExists(table, col) {
  try {
    const row = await getOne(
      `SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name=$1 AND column_name=$2) AS exists`,
      [table, col]
    );
    return !!(row && row.exists);
  } catch (e) { return false; }
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  // Auth
  const cronSecret = req.headers['x-cron-secret'] || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
  const isCron = !!cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isCron) {
    const user = await authenticate(req);
    if (!user || user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin auth required' });
    }
  }

  const result = { canonical_count: CANONICAL.length, cities_table: null, city_votes_table: null, errors: [] };

  try {
    // ── cities table ──
    if (await tableExists('cities')) {
      const hasIsActive = await columnExists('cities', 'is_active');
      const hasSlug = await columnExists('cities', 'slug');
      const hasState = await columnExists('cities', 'state');
      const inserted = [];
      const updated = [];
      for (const c of CANONICAL) {
        const cols = ['id', 'name'];
        const vals = [c.id, c.name];
        if (hasState) { cols.push('state'); vals.push(c.state); }
        if (hasSlug)  { cols.push('slug');  vals.push(c.slug); }
        if (hasIsActive) { cols.push('is_active'); vals.push(true); }
        const placeholders = vals.map((_, i) => '$' + (i + 1)).join(', ');
        const updateSet = ['name = EXCLUDED.name'];
        if (hasState) updateSet.push('state = EXCLUDED.state');
        if (hasSlug)  updateSet.push('slug = EXCLUDED.slug');
        if (hasIsActive) updateSet.push('is_active = true');
        try {
          await run(
            `INSERT INTO cities (${cols.join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet.join(', ')}`,
            vals
          );
          inserted.push(c.name);
        } catch (e) { result.errors.push({ table: 'cities', city: c.name, error: e.message }); }
      }
      // Deactivate everything not in the canonical set
      let deactivated = 0;
      if (hasIsActive) {
        try {
          const ids = CANONICAL.map(c => c.id);
          const r = await run(
            `UPDATE cities SET is_active = false WHERE id NOT IN (${ids.map((_, i) => '$' + (i + 1)).join(', ')})`,
            ids
          );
          deactivated = (r && r.rowCount) || 0;
        } catch (e) { result.errors.push({ table: 'cities', op: 'deactivate', error: e.message }); }
      }
      result.cities_table = { upserted: inserted, deactivated_other: deactivated, has_is_active: hasIsActive };
    } else {
      result.cities_table = { skipped: 'table not present' };
    }

    // ── city_votes table (read by /api/cities.js) ──
    if (await tableExists('city_votes')) {
      const hasIsActive = await columnExists('city_votes', 'is_active');
      const cityNameCol = (await columnExists('city_votes', 'city_name')) ? 'city_name'
                       : (await columnExists('city_votes', 'city')) ? 'city'
                       : 'name';
      const hasVoteCount = await columnExists('city_votes', 'vote_count');
      const hasVotes = await columnExists('city_votes', 'votes');
      const hasState = await columnExists('city_votes', 'state');
      const inserted = [];
      for (const c of CANONICAL) {
        const cols = ['id', cityNameCol];
        const vals = [c.id, c.name];
        if (hasState) { cols.push('state'); vals.push(c.state); }
        if (hasVoteCount) { cols.push('vote_count'); vals.push(100 - c.id); }
        else if (hasVotes) { cols.push('votes'); vals.push(100 - c.id); }
        if (hasIsActive) { cols.push('is_active'); vals.push(true); }
        const placeholders = vals.map((_, i) => '$' + (i + 1)).join(', ');
        const updateSet = [`${cityNameCol} = EXCLUDED.${cityNameCol}`];
        if (hasState) updateSet.push('state = EXCLUDED.state');
        if (hasIsActive) updateSet.push('is_active = true');
        try {
          await run(
            `INSERT INTO city_votes (${cols.join(', ')}) VALUES (${placeholders})
             ON CONFLICT (id) DO UPDATE SET ${updateSet.join(', ')}`,
            vals
          );
          inserted.push(c.name);
        } catch (e) { result.errors.push({ table: 'city_votes', city: c.name, error: e.message }); }
      }
      let deactivated = 0;
      if (hasIsActive) {
        try {
          const ids = CANONICAL.map(c => c.id);
          const r = await run(
            `UPDATE city_votes SET is_active = false WHERE id NOT IN (${ids.map((_, i) => '$' + (i + 1)).join(', ')})`,
            ids
          );
          deactivated = (r && r.rowCount) || 0;
        } catch (e) { result.errors.push({ table: 'city_votes', op: 'deactivate', error: e.message }); }
      }
      result.city_votes_table = { upserted: inserted, deactivated_other: deactivated, has_is_active: hasIsActive, name_column: cityNameCol };
    } else {
      result.city_votes_table = { skipped: 'table not present' };
    }

    return res.status(200).json({ ok: result.errors.length === 0, ...result });
  } catch (err) {
    console.error('[fix-cities]', err);
    return res.status(500).json({ error: err.message, ...result });
  }
};
