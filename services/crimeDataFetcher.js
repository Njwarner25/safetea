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
  if (upper.includes('SEX OFFENSE') || upper.includes('OTHER SEX') ||
      upper.includes('FONDLING') || upper.includes('INCEST') ||
      upper.includes('STATUTORY RAPE'))
    return 'sexual_assault';
  if (upper.includes('OFFENSES AGAINST FAMILY'))
    return 'domestic_violence';

  return null;
}

// ─── Helper: safe fetch with array validation ───
async function safeFetch(url, headers = {}) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '(no body)');
    throw new Error(`HTTP ${res.status}: ${text.slice(0, 200)}`);
  }
  const data = await res.json();
  if (Array.isArray(data)) return data;
  // Some APIs wrap results in an object
  if (data && data.error) throw new Error(`API error: ${JSON.stringify(data.error).slice(0, 200)}`);
  if (data && Array.isArray(data.results)) return data.results;
  if (data && Array.isArray(data.rows)) return data.rows;
  if (data && data.result && Array.isArray(data.result.records)) return data.result.records;
  if (data && Array.isArray(data.features)) return data.features.map(f => f.attributes);
  console.error('[CrimeAlerts] Unexpected response shape:', JSON.stringify(data).slice(0, 300));
  return [];
}

// ─── Socrata Query Builder ───
function socrataUrl(baseUrl, dateField, categoryField, categories, daysBack) {
  const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('.')[0];
  const catList = categories.map(c => `'${c}'`).join(',');
  const where = encodeURIComponent(`${dateField} > '${since}' AND ${categoryField} in(${catList})`);
  const order = encodeURIComponent(`${dateField} DESC`);
  return `${baseUrl}?$where=${where}&$limit=2000&$order=${order}`;
}

// ─── City Data Sources ───
const CITY_FETCHERS = {
  chicago: async (daysBack) => {
    const url = socrataUrl(
      'https://data.cityofchicago.org/resource/ijzp-q8t2.json',
      'date', 'primary_type',
      ['ASSAULT', 'BATTERY', 'CRIMINAL SEXUAL ASSAULT', 'SEX OFFENSE', 'STALKING', 'KIDNAPPING', 'INTIMIDATION', 'HUMAN TRAFFICKING'],
      daysBack
    );
    const headers = process.env.CHICAGO_SOCRATA_TOKEN ? { 'X-App-Token': process.env.CHICAGO_SOCRATA_TOKEN } : {};
    const data = await safeFetch(url, headers);
    return data.map(r => ({
      city: 'chicago',
      source_id: `chicago_${r.id}`,
      raw_category: r.domestic ? `${r.primary_type} (DOMESTIC)` : r.primary_type,
      description: r.description || r.primary_type,
      latitude: parseFloat(r.latitude),
      longitude: parseFloat(r.longitude),
      occurred_at: r.date,
      block_address: r.block
    }));
  },

  new_york: async (daysBack) => {
    // NYC publishes two datasets: "Current (Year To Date)" (5uac-w243) and
    // "Historic" (qgea-i56i). The YTD dataset lags by ~1 quarter, so query
    // both and merge to maximize coverage.
    const categories = ['RAPE', 'FELONY ASSAULT', 'SEX CRIMES', 'KIDNAPPING & RELATED OFFENSES', 'HARRASSMENT 2', 'ASSAULT 3 & RELATED OFFENSES'];
    const headers = process.env.NYC_SOCRATA_TOKEN ? { 'X-App-Token': process.env.NYC_SOCRATA_TOKEN } : {};
    const urlYTD = socrataUrl(
      'https://data.cityofnewyork.us/resource/5uac-w243.json',
      'cmplnt_fr_dt', 'ofns_desc', categories, daysBack
    );
    const urlHist = socrataUrl(
      'https://data.cityofnewyork.us/resource/qgea-i56i.json',
      'cmplnt_fr_dt', 'ofns_desc', categories, daysBack
    );
    const [dataYTD, dataHist] = await Promise.all([
      safeFetch(urlYTD, headers).catch(() => []),
      safeFetch(urlHist, headers).catch(() => [])
    ]);
    // Deduplicate by complaint number, preferring YTD (more current)
    const seen = new Set();
    const merged = [];
    for (const r of [...dataYTD, ...dataHist]) {
      if (!r.cmplnt_num || seen.has(r.cmplnt_num)) continue;
      seen.add(r.cmplnt_num);
      merged.push(r);
    }
    return merged.map(r => ({
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
    // LAPD transitioned to NIBRS in March 2024. The old UCR dataset (2nrs-mtv8)
    // stopped updating at Dec 2024. New NIBRS datasets:
    //   y8y3-fqfu = 2024-2025 (NO lat/lon fields)
    //   k7nn-b2ep = 2026-present (HAS hndrdth_lat/hndrdth_lon)
    // Query the 2026+ dataset first (has coords), fall back to 2024-2025.
    const nibrsCategories = [
      'Aggravated Assault', 'Simple Assault', 'Intimidation',
      'Rape', 'Sodomy', 'Sexual Assault With An Object', 'Fondling',
      'Kidnapping/Abduction', 'Human Trafficking, Commercial Sex Acts',
      'Human Trafficking, Involuntary Servitude', 'Stalking',
      'Incest', 'Statutory Rape'
    ];
    const headers = process.env.LA_SOCRATA_TOKEN ? { 'X-App-Token': process.env.LA_SOCRATA_TOKEN } : {};

    // 2026+ dataset (has coordinates)
    const url2026 = socrataUrl(
      'https://data.lacity.org/resource/k7nn-b2ep.json',
      'date_occ', 'nibr_description', nibrsCategories, daysBack
    );
    // 2024-2025 dataset (no coordinates — records will be filtered out later)
    const url2425 = socrataUrl(
      'https://data.lacity.org/resource/y8y3-fqfu.json',
      'date_occ', 'nibr_description', nibrsCategories, daysBack
    );

    const [data2026, data2425] = await Promise.all([
      safeFetch(url2026, headers).catch(() => []),
      safeFetch(url2425, headers).catch(() => [])
    ]);

    // Deduplicate by uniquenibrno
    const seen = new Set();
    const merged = [];
    for (const r of [...data2026, ...data2425]) {
      const key = r.uniquenibrno || r.caseno;
      if (!key || seen.has(key)) continue;
      seen.add(key);
      merged.push(r);
    }

    return merged.map(r => ({
      city: 'los_angeles',
      source_id: `los_angeles_${r.uniquenibrno || r.caseno}`,
      raw_category: r.nibr_description,
      description: `${r.nibr_description}${r.domestic_violence_crime === 'Yes' ? ' (DOMESTIC)' : ''}`,
      latitude: parseFloat(r.hndrdth_lat || r.lat),
      longitude: parseFloat(r.hndrdth_lon || r.lon),
      occurred_at: r.date_occ,
      block_address: r.premis_desc || r.area_name
    }));
  },

  dallas: async (daysBack) => {
    // The old dataset (yn72-daik) dropped the date1 column. The newer
    // "Police Incidents" dataset (qv6i-rri7) has date1 and all NIBRS fields.
    const url = socrataUrl(
      'https://www.dallasopendata.com/resource/qv6i-rri7.json',
      'date1', 'nibrs_crime_category',
      ['ASSAULT OFFENSES', 'SEX OFFENSES', 'KIDNAPPING/ABDUCTION', 'HUMAN TRAFFICKING'],
      daysBack
    );
    const headers = process.env.DALLAS_SOCRATA_TOKEN ? { 'X-App-Token': process.env.DALLAS_SOCRATA_TOKEN } : {};
    const data = await safeFetch(url, headers);
    return data.map(r => {
      const geo = r.geocoded_column || {};
      return {
        city: 'dallas',
        source_id: `dallas_${r.incidentnum}`,
        raw_category: r.nibrs_crime_category,
        description: r.nibrs_crime || r.nibrs_crime_category,
        latitude: parseFloat(geo.latitude || r.y_cordinate),
        longitude: parseFloat(geo.longitude || r.x_coordinate),
        occurred_at: r.date1,
        block_address: r.incident_address
      };
    });
  },

  atlanta: async (daysBack) => {
    // Atlanta moved from Socrata to ArcGIS Hub. The crime data lives at
    // services3.arcgis.com under org Et5Qfajgiyosiw4d, service
    // OpenDataWebsite_Crime_view, layer 0. Fields use NIBRS naming.
    const since = new Date(Date.now() - daysBack * 86400000).getTime();
    const offenses = [
      'Aggravated Assault', 'Simple Assault', 'Intimidation',
      'Rape', 'Sodomy', 'Sexual Assault With An Object', 'Fondling',
      'Kidnapping/Abduction', 'Human Trafficking, Commercial Sex Acts',
      'Human Trafficking, Involuntary Servitude', 'Stalking', 'Robbery',
      'Indecent Exposure'
    ].map(o => `'${o}'`).join(',');
    const params = new URLSearchParams({
      where: `OccurredFromDate >= ${since} AND NIBRS_Offense IN (${offenses})`,
      outFields: 'OBJECTID,ReportNumber,NIBRS_Offense,OccurredFromDate,Latitude,Longitude,StreetAddress,NibrsUcrCode',
      outSR: '4326',
      resultRecordCount: '2000',
      orderByFields: 'OccurredFromDate DESC',
      f: 'json'
    });
    const baseUrl = 'https://services3.arcgis.com/Et5Qfajgiyosiw4d/ArcGIS/rest/services/OpenDataWebsite_Crime_view/FeatureServer/0/query';
    const data = await safeFetch(`${baseUrl}?${params}`);
    return data.map(r => ({
      city: 'atlanta',
      source_id: `atlanta_${r.ReportNumber || r.OBJECTID}`,
      raw_category: r.NIBRS_Offense,
      description: r.NIBRS_Offense,
      latitude: parseFloat(r.Latitude),
      longitude: parseFloat(r.Longitude),
      occurred_at: r.OccurredFromDate ? new Date(r.OccurredFromDate).toISOString() : null,
      block_address: r.StreetAddress
    }));
  },

  houston: async (daysBack) => {
    // Houston moved to mycity2.houstontx.gov. The NIBRS_Recent_Crime_Reports
    // FeatureServer has fields prefixed with USER_. Coordinates come from
    // the geometry object (need outSR=4326 for lat/lon).
    const since = new Date(Date.now() - daysBack * 86400000).getTime();
    const offenses = [
      'Aggravated Assault', 'Simple Assault', 'Intimidation',
      'Rape', 'Sodomy', 'Sexual Assault With An Object', 'Fondling',
      'Kidnapping/Abduction', 'Human Trafficking, Commercial Sex Acts',
      'Human Trafficking, Involuntary Servitude', 'Stalking'
    ].map(o => `'${o}'`).join(',');
    const baseUrl = 'https://mycity2.houstontx.gov/pubgis02/rest/services/HPD/NIBRS_Recent_Crime_Reports/FeatureServer/0/query';
    const params = new URLSearchParams({
      where: `USER_RMSOccurrenceDate >= ${since} AND USER_NIBRSDescription IN (${offenses})`,
      outFields: 'OBJECTID,USER_Incident,USER_NIBRSDescription,USER_NIBRSClass,USER_RMSOccurrenceDate,USER_StreetName,USER_BlockRange,USER_StreetType',
      outSR: '4326',
      returnGeometry: 'true',
      resultRecordCount: '2000',
      orderByFields: 'USER_RMSOccurrenceDate DESC',
      f: 'json'
    });
    const res = await fetch(`${baseUrl}?${params}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    if (json.error) throw new Error(`ArcGIS error: ${JSON.stringify(json.error).slice(0, 200)}`);
    const features = json.features || [];
    return features.map(f => {
      const r = f.attributes;
      const geo = f.geometry || {};
      return {
        city: 'houston',
        source_id: `houston_${r.USER_Incident || r.OBJECTID}`,
        raw_category: r.USER_NIBRSDescription,
        description: r.USER_NIBRSDescription,
        latitude: parseFloat(geo.y),
        longitude: parseFloat(geo.x),
        occurred_at: r.USER_RMSOccurrenceDate ? new Date(r.USER_RMSOccurrenceDate).toISOString() : null,
        block_address: [r.USER_BlockRange, r.USER_StreetName, r.USER_StreetType].filter(Boolean).join(' ')
      };
    });
  },

  miami: async (daysBack) => {
    // The old data.miamigov.com Socrata endpoint was decommissioned.
    // Miami/Miami-Dade does not currently publish a queryable crime incident
    // API with lat/lon. Using CrimeMapping.com BAIR data as a fallback,
    // which is what Miami PD links to from their official website.
    // If this endpoint also fails, return empty gracefully.
    try {
      const since = new Date(Date.now() - daysBack * 86400000).toISOString();
      const now = new Date().toISOString();
      const url = `https://www.crimemapping.com/api/Incidents/Get?` + new URLSearchParams({
        lat: '25.7617',
        lng: '-80.1918',
        radius: '15',
        startDate: since,
        endDate: now,
        categories: 'Assault,Sex Crimes,Robbery,Kidnapping'
      });
      const res = await fetch(url, {
        headers: { 'Accept': 'application/json', 'Referer': 'https://www.crimemapping.com/' }
      });
      if (!res.ok) {
        console.warn(`[CrimeAlerts] miami: CrimeMapping API returned ${res.status}, returning empty`);
        return [];
      }
      const json = await res.json();
      const items = Array.isArray(json) ? json : (json.incidents || json.data || []);
      return items.map(r => ({
        city: 'miami',
        source_id: `miami_${r.id || r.caseNumber || r.incidentId}`,
        raw_category: r.type || r.category || r.offense,
        description: r.description || r.type || r.category || '',
        latitude: parseFloat(r.lat || r.latitude),
        longitude: parseFloat(r.lng || r.longitude),
        occurred_at: r.date || r.incidentDate || r.reportDate,
        block_address: r.location || r.address || ''
      }));
    } catch (err) {
      console.warn(`[CrimeAlerts] miami: ${err.message} — endpoint unavailable, returning empty`);
      return [];
    }
  },

  boston: async (daysBack) => {
    // The CKAN resource UUID changed. Current resource for "Crime Incident
    // Reports - 2023 to Present" is b973d8cb-eeb2-4e7e-99da-c92938efc9c0.
    const since = new Date(Date.now() - daysBack * 86400000).toISOString().split('T')[0];
    const sqlQuery = `SELECT * FROM "b973d8cb-eeb2-4e7e-99da-c92938efc9c0" WHERE "OCCURRED_ON_DATE" >= '${since}' AND "OFFENSE_DESCRIPTION" IN ('ASSAULT - AGGRAVATED','ASSAULT - AGGRAVATED - BATTERY','RAPE','INDECENT ASSAULT','KIDNAPPING','KIDNAPPING/ENTICING','HARASSMENT','STALKING','HUMAN TRAFFICKING - INVOLUNTARY SERVITUDE','HUMAN TRAFFICKING - COMMERCIAL SEX ACTS') ORDER BY "OCCURRED_ON_DATE" DESC LIMIT 2000`;
    const url = `https://data.boston.gov/api/3/action/datastore_search_sql?sql=${encodeURIComponent(sqlQuery)}`;
    const data = await safeFetch(url);
    return data.map(r => ({
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
    const sql = `SELECT * FROM incidents_part1_part2 WHERE dispatch_date >= '${since}' AND text_general_code IN ('Aggravated Assault No Firearm','Aggravated Assault Firearm','Rape','Other Assaults','Kidnapping','Other Sex Offenses','Offenses Against Family and Children') ORDER BY dispatch_date DESC LIMIT 2000`;
    const url = `https://phl.carto.com/api/v2/sql?q=${encodeURIComponent(sql)}`;
    const data = await safeFetch(url);
    return data.map(r => ({
      city: 'philadelphia',
      source_id: `philadelphia_${r.objectid}`,
      raw_category: r.text_general_code,
      description: r.text_general_code,
      latitude: parseFloat(r.lat || r.point_y),
      longitude: parseFloat(r.lng || r.point_x),
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
  const COLS = 10;
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
  return { total: totalInserted, cities: cityResults };
}

module.exports = { fetchAllCities, SAFETY_CATEGORY_MAP, normalizeCrimeType };
