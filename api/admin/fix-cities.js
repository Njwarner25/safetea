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

  /**
   * Name-or-slug-based UPSERT. Tries name first, then slug (cities.slug
   * has its own unique index — name-only lookup misses when name and slug
   * have drifted). Handles a second NOT NULL companion name column
   * (city_votes has both city_name AND city; city is NOT NULL).
   * On match → UPDATE in place (id preserved for FKs).
   * On no match → INSERT with all known columns populated.
   */
  async function upsertByNameOrSlug(table, nameCol, extraNameCol, c, has) {
    try {
      let existing = await getOne(`SELECT id FROM ${table} WHERE LOWER(${nameCol}) = LOWER($1) LIMIT 1`, [c.name]);
      if (!existing && extraNameCol) {
        existing = await getOne(`SELECT id FROM ${table} WHERE LOWER(${extraNameCol}) = LOWER($1) LIMIT 1`, [c.name]);
      }
      if (!existing && has.slug) {
        existing = await getOne(`SELECT id FROM ${table} WHERE LOWER(slug) = LOWER($1) LIMIT 1`, [c.slug]);
      }
      if (existing && existing.id != null) {
        const sets = [];
        const vals = [];
        sets.push(`${nameCol} = $${sets.length + 1}`); vals.push(c.name);
        if (extraNameCol) { sets.push(`${extraNameCol} = $${sets.length + 1}`); vals.push(c.name); }
        if (has.state)    { sets.push(`state = $${sets.length + 1}`);   vals.push(c.state); }
        if (has.slug)     { sets.push(`slug = $${sets.length + 1}`);    vals.push(c.slug); }
        if (has.isActive) { sets.push(`is_active = true`); }
        vals.push(existing.id);
        await run(`UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${vals.length}`, vals);
        return { action: 'updated', id: existing.id };
      }
      const cols = [nameCol];
      const vals = [c.name];
      if (extraNameCol) { cols.push(extraNameCol); vals.push(c.name); }
      if (has.state)     { cols.push('state'); vals.push(c.state); }
      if (has.slug)      { cols.push('slug');  vals.push(c.slug); }
      if (has.voteCount) { cols.push('vote_count'); vals.push(100 - CANONICAL.findIndex(x => x.name === c.name)); }
      else if (has.votes){ cols.push('votes');      vals.push(100 - CANONICAL.findIndex(x => x.name === c.name)); }
      if (has.isActive)  { cols.push('is_active'); vals.push(true); }
      const placeholders = vals.map((_, i) => '$' + (i + 1)).join(', ');
      const ins = await getOne(`INSERT INTO ${table} (${cols.join(', ')}) VALUES (${placeholders}) RETURNING id`, vals);
      return { action: 'inserted', id: ins && ins.id };
    } catch (e) {
      result.errors.push({ table, city: c.name, error: e.message });
      return { action: 'failed' };
    }
  }

  try {
    // ── cities table ──
    if (await tableExists('cities')) {
      const has = {
        isActive: await columnExists('cities', 'is_active'),
        slug:     await columnExists('cities', 'slug'),
        state:    await columnExists('cities', 'state'),
      };
      const upserted = [];
      const keepIds = [];
      for (const c of CANONICAL) {
        const r = await upsertByNameOrSlug('cities', 'name', null, c, has);
        if (r.action !== 'failed') {
          upserted.push(c.name);
          if (r.id != null) keepIds.push(r.id);
        }
      }
      // Deactivate everything not in the canonical set
      let deactivated = 0;
      if (has.isActive && keepIds.length) {
        try {
          const placeholders = keepIds.map((_, i) => '$' + (i + 1)).join(', ');
          const r = await run(
            `UPDATE cities SET is_active = false WHERE id NOT IN (${placeholders})`,
            keepIds
          );
          deactivated = (r && r.rowCount) || 0;
        } catch (e) { result.errors.push({ table: 'cities', op: 'deactivate', error: e.message }); }
      }
      result.cities_table = { upserted, deactivated_other: deactivated, has_is_active: has.isActive, kept_ids: keepIds };
    } else {
      result.cities_table = { skipped: 'table not present' };
    }

    // ── city_votes table (read by /api/cities.js) ──
    if (await tableExists('city_votes')) {
      // Some prod schemas have BOTH city_name AND city (the latter is NOT NULL).
      // Detect each independently and populate whichever is present.
      const hasCityName = await columnExists('city_votes', 'city_name');
      const hasCityCol  = await columnExists('city_votes', 'city');
      const hasNameCol  = await columnExists('city_votes', 'name');
      const primaryNameCol = hasCityName ? 'city_name' : hasCityCol ? 'city' : 'name';
      const extraNameCol = (primaryNameCol === 'city_name' && hasCityCol) ? 'city'
                         : (primaryNameCol === 'city' && hasCityName) ? 'city_name'
                         : (primaryNameCol !== 'name' && hasNameCol) ? 'name'
                         : null;
      const has = {
        isActive:  await columnExists('city_votes', 'is_active'),
        state:     await columnExists('city_votes', 'state'),
        voteCount: await columnExists('city_votes', 'vote_count'),
        votes:     await columnExists('city_votes', 'votes'),
        slug:      await columnExists('city_votes', 'slug'),
      };
      const upserted = [];
      const keepIds = [];
      for (const c of CANONICAL) {
        const r = await upsertByNameOrSlug('city_votes', primaryNameCol, extraNameCol, c, has);
        if (r.action !== 'failed') {
          upserted.push(c.name);
          if (r.id != null) keepIds.push(r.id);
        }
      }
      let deactivated = 0;
      if (has.isActive && keepIds.length) {
        try {
          const placeholders = keepIds.map((_, i) => '$' + (i + 1)).join(', ');
          const r = await run(
            `UPDATE city_votes SET is_active = false WHERE id NOT IN (${placeholders})`,
            keepIds
          );
          deactivated = (r && r.rowCount) || 0;
        } catch (e) { result.errors.push({ table: 'city_votes', op: 'deactivate', error: e.message }); }
      }
      result.city_votes_table = {
        upserted,
        deactivated_other: deactivated,
        has_is_active: has.isActive,
        primary_name_column: primaryNameCol,
        extra_name_column: extraNameCol,
        kept_ids: keepIds,
      };
    } else {
      result.city_votes_table = { skipped: 'table not present' };
    }

    return res.status(200).json({ ok: result.errors.length === 0, ...result });
  } catch (err) {
    console.error('[fix-cities]', err);
    return res.status(500).json({ error: err.message, ...result });
  }
};
