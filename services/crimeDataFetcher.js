const { run, getOne } = require('../api/_utils/db');

// ─── Safety Category Mapping ───
const SAFETY_CATEGORY_MAP = {
  sexual_assault:    { label: 'Sexual Assault',    severity: 'high',   icon: '🚨' },
  assault:           { label: 'Assault',            severity: 'high',   icon: '⚠️' },
  domestic_violence: { label: 'Domestic Violence',  severity: 'high',   icon: '🚨' },
  stalking:          { label: 'Stalking',           severity: 'high',   icon: '🚨' },
  kidnapping:        { label: 'Kidnapping',         severity: 'high',   icon: '🚨' },
  human_trafficking: { label: 'Human Trafficking',  severity: 'high',   icon: '🚨' },
  harassment:        { label: 'Harassment',          severity: 'medium', icon: '⚠️' },
  robbery:           { label: 'Robbery',             severity: 'medium', icon: '⚠️' },
  indecent_exposure: { label: 'Indecent Exposure',   severity: 'medium', icon: '⚠️' },
};

function normalizeCrimeType(rawCategory) {
  const upper = (rawCategory || '').toUpperCase();

  if (upper.includes('RAPE') || upper.includes('SEXUAL ASSAULT') ||
      upper.includes('CRIMINAL SEXUAL') || upper.includes('SEX CRIMES') ||
      upper.includes('SODOMY') || upper.includes('SEXUAL PENETRATION'))
    return 'sexual_assault';
  if (upper.includes('DOMESTIC') || upper.includes('INTIMATE PARTNER'))
    return 'domestic_violence';
  if (upper.includes('STALKING'))
    return 'stalking';
  if (upper.includes('KIDNAP'))
    return 'kidnapping';
  if (upper.includes('HUMAN TRAFFICKING') || upper.includes('TRAFFICKING'))
    return 'human_trafficking';
  if (upper.includes('HARASSMENT') || upper.includes('INTIMIDATION'))
    return 'harassment';
  if (upper.includes('ROBBERY'))
    return 'robbery';
  if (upper.includes('INDECENT') || upper.includes('PEEPING') ||
      upper.includes('LEWD') || upper.includes('EXPOSURE'))
    return 'indecent_exposure';
  if (upper.includes('ASSAULT') || upper.includes('BATTERY'))
    return 'assault';

  return null;
}

// ─── City Data Sources ───

function buildSocrataQuery(baseUrl, dateField, categoryField, categories, daysBack, appToken) {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString();
  const catList = categories.map(c => `'${c}'`).join(',');
  const query = `${baseUrl}?$where=${dateField} > '${since}' AND ${categoryField} in(${catList})&$limit=5000&$order=${dateField} DESC`;
  return { url: query, headers: appToken ? { 'X-App-Token': appToken } : {} };
}

const CITY_FETCHERS = {
  chicago: async (daysBack) => {
    const { url, headers } = buildSocrataQuery(
      'https://data.cityofchicago.org/resource/ijzp-q8t2.json',
      'date', 'primary_type',
      ['ASSAULT', 'BATTERY', 'CRIMINAL SEXUAL ASSAULT', 'SEX OFFENSE', 'STALKING', 'KIDNAPPING', 'DOMESTIC VIOLENCE', 'INTIMIDATION', 'HUMAN TRAFFICKING'],
      daysBack, process.env.CHICAGO_SOCRATA_TOKEN
    );
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => ({
      city: 'chicago',
      source_id: `chicago_${r.id}`,
      raw_category: r.primary_type,
      description: r.description || r.primary_type,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      occurred_at: r.date,
      block_address: r.block
    }));
  },

  new_york: async (daysBack) => {
    const { url, headers } = buildSocrataQuery(
      'https://data.cityofnewyork.us/resource/5uac-w243.json',
      'cmplnt_fr_dt', 'ofns_desc',
      ['RAPE', 'FELONY ASSAULT', 'SEX CRIMES', 'KIDNAPPING & RELATED OFFENSES', 'HARRASSMENT 2', 'ASSAULT 3 & RELATED OFFENSES', 'OFFENSES AGAINST THE PERSON'],
      daysBack, process.env.NYC_SOCRATA_TOKEN
    );
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => ({
      city: 'new_york',
      source_id: `new_york_${r.cmplnt_num}`,
      raw_category: r.ofns_desc,
      description: r.pd_desc || r.ofns_desc,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      occurred_at: r.cmplnt_fr_dt,
      block_address: r.addr_pct_cd
    }));
  },

  los_angeles: async (daysBack) => {
    const { url, headers } = buildSocrataQuery(
      'https://data.lacity.org/resource/2nrs-mtv8.json',
      'date_occ', 'crm_cd_desc',
      ['BATTERY - SIMPLE ASSAULT', 'ASSAULT WITH DEADLY WEAPON, AGGRAVATED ASSAULT', 'INTIMATE PARTNER - SIMPLE ASSAULT', 'INTIMATE PARTNER - AGGRAVATED ASSAULT', 'RAPE, FORCIBLE', 'SEXUAL PENETRATION W/FOREIGN OBJECT', 'STALKING', 'KIDNAPPING', 'HUMAN TRAFFICKING - COMMERCIAL SEX ACTS', 'INDECENT EXPOSURE', 'PEEPING TOM'],
      daysBack, process.env.LA_SOCRATA_TOKEN
    );
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => ({
      city: 'los_angeles',
      source_id: `los_angeles_${r.dr_no}`,
      raw_category: r.crm_cd_desc,
      description: r.crm_cd_desc,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lon),
      occurred_at: r.date_occ,
      block_address: r.location
    }));
  },

  dallas: async (daysBack) => {
    const { url, headers } = buildSocrataQuery(
      'https://www.dallasopendata.com/resource/yn72-daik.json',
      'date1', 'nibrs_crime_category',
      ['ASSAULT OFFENSES', 'SEX OFFENSES', 'KIDNAPPING/ABDUCTION', 'HUMAN TRAFFICKING'],
      daysBack, process.env.DALLAS_SOCRATA_TOKEN
    );
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => {
      const geo = r.geocoded_column || {};
      return {
        city: 'dallas',
        source_id: `dallas_${r.servnumb}`,
        raw_category: r.nibrs_crime_category,
        description: r.nibrs_crime || r.nibrs_crime_category,
        latitude: parseFloat(geo.latitude || r.y_coordinate),
        longitude: parseFloat(geo.longitude || r.x_cordinate),
        occurred_at: r.date1,
        block_address: r.location1
      };
    });
  },

  atlanta: async (daysBack) => {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();
    const url = `https://opendata.atlantapd.org/resource/crime-data.json?$where=occur_date > '${since}' AND ucr_literal in('AGG ASSAULT','RAPE','ROBBERY','KIDNAPPING')&$limit=5000&$order=occur_date DESC`;
    const headers = process.env.ATLANTA_SOCRATA_TOKEN ? { 'X-App-Token': process.env.ATLANTA_SOCRATA_TOKEN } : {};
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => ({
      city: 'atlanta',
      source_id: `atlanta_${r.report_number}`,
      raw_category: r.ucr_literal,
      description: r.ibr_code || r.ucr_literal,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      occurred_at: r.occur_date,
      block_address: r.location
    }));
  },

  houston: async (daysBack) => {
    const url = 'https://services1.arcgis.com/HPAghgOBFDCVCCyR/arcgis/rest/services/HPD_Crime_Summary_2020_2024/FeatureServer/0/query';
    const params = new URLSearchParams({
      where: `NIBRSDescription IN ('Aggravated Assault','Simple Assault','Rape','Sodomy','Sexual Assault With An Object','Fondling','Kidnapping/Abduction','Human Trafficking','Stalking','Intimidation')`,
      outFields: '*',
      resultRecordCount: '5000',
      orderByFields: 'Date DESC',
      f: 'json'
    });
    const res = await fetch(`${url}?${params}`);
    const data = await res.json();
    return ((data.features || []).map(f => f.attributes)).map(r => ({
      city: 'houston',
      source_id: `houston_${r.ObjectId}`,
      raw_category: r.NIBRSDescription,
      description: r.NIBRSDescription,
      latitude: parseFloat(r.MapLatitude),
      longitude: parseFloat(r.MapLongitude),
      occurred_at: r.Date ? new Date(r.Date).toISOString() : null,
      block_address: r.StreetName
    }));
  },

  miami: async (daysBack) => {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString();
    const token = process.env.MIAMI_SOCRATA_TOKEN;
    const url = `https://data.miamigov.com/resource/crimes.json?$where=report_date > '${since}'&$limit=5000&$order=report_date DESC`;
    const headers = token ? { 'X-App-Token': token } : {};
    const res = await fetch(url, { headers });
    const data = await res.json();
    return (data || []).map(r => ({
      city: 'miami',
      source_id: `miami_${r.case_number}`,
      raw_category: r.offense,
      description: r.offense,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      occurred_at: r.report_date,
      block_address: r.location_address
    }));
  },

  boston: async (daysBack) => {
    const { url, headers } = buildSocrataQuery(
      'https://data.boston.gov/api/3/action/datastore_search_sql',
      '', '', [], daysBack, process.env.BOSTON_SOCRATA_TOKEN
    );
    // Boston uses CKAN, not standard Socrata — custom query
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const sqlQuery = `SELECT * FROM "12cb3883-56f5-47de-afa5-3b1cf61b257b" WHERE "OCCURRED_ON_DATE" >= '${since}' AND "OFFENSE_DESCRIPTION" IN ('ASSAULT - AGGRAVATED','ASSAULT - AGGRAVATED - BATTERY','RAPE','INDECENT ASSAULT','KIDNAPPING','KIDNAPPING/ENTICING','HARASSMENT','STALKING','HUMAN TRAFFICKING - INVOLUNTARY SERVITUDE','HUMAN TRAFFICKING - COMMERCIAL SEX ACTS') ORDER BY "OCCURRED_ON_DATE" DESC LIMIT 5000`;
    const bostonUrl = `https://data.boston.gov/api/3/action/datastore_search_sql?sql=${encodeURIComponent(sqlQuery)}`;
    const res = await fetch(bostonUrl);
    const data = await res.json();
    const records = (data.result && data.result.records) || [];
    return records.map(r => ({
      city: 'boston',
      source_id: `boston_${r.INCIDENT_NUMBER}`,
      raw_category: r.OFFENSE_DESCRIPTION,
      description: r.OFFENSE_DESCRIPTION,
      latitude: parseFloat(r.Lat),
      longitude: parseFloat(r.Long),
      occurred_at: r.OCCURRED_ON_DATE,
      block_address: r.STREET
    }));
  },

  philadelphia: async (daysBack) => {
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const sql = `SELECT * FROM incidents_part1_part2 WHERE dispatch_date >= '${since}' AND text_general_code IN ('Aggravated Assault No Firearm','Aggravated Assault Firearm','Rape','Other Assaults','Kidnapping','Other Sex Offenses','Offenses Against Family and Children') ORDER BY dispatch_date DESC LIMIT 5000`;
    const url = `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`;
    const res = await fetch(url);
    const data = await res.json();
    return (data.rows || []).map(r => ({
      city: 'philadelphia',
      source_id: `philadelphia_${r.objectid}`,
      raw_category: r.text_general_code,
      description: r.text_general_code,
      latitude: parseFloat(r.lat),
      longitude: parseFloat(r.lng),
      occurred_at: r.dispatch_date,
      block_address: r.location_block
    }));
  }
};

// ─── Normalize + Filter ───
function normalizeRecords(records) {
  return records
    .filter(r => r.latitude && r.longitude && !isNaN(r.latitude) && !isNaN(r.longitude) && r.occurred_at)
    .map(r => {
      const crimeType = normalizeCrimeType(r.raw_category);
      if (!crimeType) return null;
      return {
        ...r,
        crime_type: crimeType,
        severity: SAFETY_CATEGORY_MAP[crimeType]?.severity || 'medium',
        occurred_at: new Date(r.occurred_at)
      };
    })
    .filter(Boolean);
}

// ─── Batch Upsert (50 rows per INSERT) ───
async function upsertAlerts(alerts) {
  const BATCH_SIZE = 50;
  const COLS = 10; // city, source_id, crime_type, description, latitude, longitude, occurred_at, block_address, severity, raw_category
  let count = 0;

  for (let i = 0; i < alerts.length; i += BATCH_SIZE) {
    const batch = alerts.slice(i, i + BATCH_SIZE);
    const params = [];
    const valueClauses = [];

    for (let j = 0; j < batch.length; j++) {
      const a = batch[j];
      const offset = j * COLS;
      valueClauses.push(`($${offset+1}, $${offset+2}, $${offset+3}, $${offset+4}, $${offset+5}, $${offset+6}, $${offset+7}, $${offset+8}, $${offset+9}, $${offset+10})`);
      params.push(a.city, a.source_id, a.crime_type, a.description, a.latitude, a.longitude, a.occurred_at, a.block_address, a.severity, a.raw_category);
    }

    try {
      await run(
        `INSERT INTO crime_alerts (city, source_id, crime_type, description, latitude, longitude, occurred_at, block_address, severity, raw_category)
         VALUES ${valueClauses.join(', ')}
         ON CONFLICT (source_id) DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()`,
        params
      );
      count += batch.length;
    } catch (err) {
      console.error(`[CrimeAlerts] Batch upsert failed (${batch.length} rows):`, err.message);
      // Fall back to individual inserts for this batch
      for (const a of batch) {
        try {
          await run(
            `INSERT INTO crime_alerts (city, source_id, crime_type, description, latitude, longitude, occurred_at, block_address, severity, raw_category)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
             ON CONFLICT (source_id) DO UPDATE SET description = EXCLUDED.description, updated_at = NOW()`,
            [a.city, a.source_id, a.crime_type, a.description, a.latitude, a.longitude, a.occurred_at, a.block_address, a.severity, a.raw_category]
          );
          count++;
        } catch (e) { /* skip bad row */ }
      }
    }
  }
  return count;
}

// ─── Main Fetch All ───
async function fetchAllCities() {
  const cities = Object.keys(CITY_FETCHERS);
  let totalInserted = 0;
  const cityResults = {};

  // Fetch cities sequentially to avoid overwhelming external APIs + Vercel
  for (const city of cities) {
    try {
      console.log(`[CrimeAlerts] Fetching ${city}...`);
      const raw = await CITY_FETCHERS[city](30);
      const normalized = normalizeRecords(raw);
      console.log(`[CrimeAlerts] ${city}: ${raw.length} raw -> ${normalized.length} normalized`);

      if (normalized.length > 0) {
        const count = await upsertAlerts(normalized);
        totalInserted += count;
        cityResults[city] = { raw: raw.length, normalized: normalized.length, inserted: count };
      } else {
        cityResults[city] = { raw: raw.length, normalized: 0, inserted: 0 };
      }
    } catch (err) {
      console.error(`[CrimeAlerts] ${city} failed:`, err.message);
      cityResults[city] = { error: err.message };
    }
  }

  // Clean up alerts older than 90 days
  await run(`DELETE FROM crime_alerts WHERE occurred_at < NOW() - INTERVAL '90 days'`);

  console.log(`[CrimeAlerts] Total upserted: ${totalInserted}`, JSON.stringify(cityResults));
  return totalInserted;
}

module.exports = { fetchAllCities, SAFETY_CATEGORY_MAP, normalizeCrimeType };
