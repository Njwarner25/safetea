const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { first, last, city, state } = req.query;
  if (!last) return res.status(400).json({ error: 'Last name required' });

  const fullName = ((first || '') + ' ' + last).trim();

  try {
    const results = [];

    // Strategy 1: Try SerpAPI if configured (best results)
    const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERP_API_KEY;
    if (SERPAPI_KEY) {
      const serpResults = await searchViaSerpAPI(fullName, first, last, city, state, SERPAPI_KEY);
      results.push(...serpResults);
    }

    // Strategy 2: Search NSOPW (National Sex Offender Public Website) via their search
    const nsopwResults = await searchNSOPW(first || '', last, city, state);
    results.push(...nsopwResults);

    // Strategy 3: Generate direct registry search links for the user's state
    const registryLinks = getStateRegistryLinks(first || '', last, state);

    // Deduplicate by link
    const seen = new Set();
    const deduped = results.filter(r => {
      if (seen.has(r.link)) return false;
      seen.add(r.link);
      return true;
    });

    return res.status(200).json({
      results: deduped.slice(0, 15),
      registry_links: registryLinks,
      query: fullName,
      total: deduped.length
    });
  } catch (err) {
    console.error('[Offender] Search failed:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
};

// ─── NSOPW Search ───
async function searchNSOPW(first, last, city, state) {
  try {
    // NSOPW has a public search endpoint
    const params = new URLSearchParams({
      lastName: last,
      firstName: first || '',
      ...(city ? { city } : {}),
      ...(state ? { state } : {})
    });

    const url = `https://www.nsopw.gov/api/Search?${params}`;
    const response = await fetch(url, {
      headers: { 'Accept': 'application/json', 'User-Agent': 'SafeTea Safety App' },
      signal: AbortSignal.timeout(10000)
    });

    if (!response.ok) return [];

    const data = await response.json();
    if (!data || !Array.isArray(data)) return [];

    return data.slice(0, 10).map(r => ({
      title: [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ') || `${first} ${last}`,
      snippet: [
        r.city && r.state ? `${r.city}, ${r.state}` : '',
        r.offenses ? `Offense: ${r.offenses}` : '',
        r.riskLevel ? `Risk Level: ${r.riskLevel}` : ''
      ].filter(Boolean).join(' — '),
      link: r.url || `https://www.nsopw.gov/search-results?lastName=${encodeURIComponent(last)}&firstName=${encodeURIComponent(first)}`,
      source: 'NSOPW.gov (Federal Registry)',
      is_registry: true
    }));
  } catch (err) {
    console.error('[Offender] NSOPW search failed:', err.message);
    return [];
  }
}

// ─── SerpAPI Search ───
async function searchViaSerpAPI(fullName, first, last, city, state, apiKey) {
  try {
    const locationParts = [city, state].filter(Boolean).join(', ');
    const queries = [
      `"${fullName}" sex offender` + (locationParts ? ` ${locationParts}` : ''),
      `"${fullName}" offender registry` + (state ? ` ${state}` : '')
    ];

    const allResults = [];
    const seenLinks = new Set();

    for (const query of queries) {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${apiKey}&num=10`;
      const response = await fetch(url, { signal: AbortSignal.timeout(10000) });
      const data = await response.json();
      if (data.error) continue;

      for (const r of (data.organic_results || [])) {
        const link = (r.link || '').toLowerCase();
        const snippet = (r.snippet || '').toLowerCase();
        const title = (r.title || '').toLowerCase();
        if (seenLinks.has(link)) continue;

        const registryDomains = ['nsopw.gov', 'meganslaw', 'offender', 'registry', 'sexoffender', 'sor.', 'familywatchdog', 'homefacts', 'bustedoffenders', 'mugshots', 'icrimewatch', 'sheriffalerts'];
        const isRegistry = registryDomains.some(d => link.includes(d));
        const mentionsOffender = snippet.includes('sex offender') || snippet.includes('registered offender') || title.includes('offender');

        if ((isRegistry || mentionsOffender) && snippet.includes(last.toLowerCase())) {
          seenLinks.add(link);
          allResults.push({
            title: r.title || '', snippet: r.snippet || '', link: r.link || '',
            source: r.displayed_link || '', is_registry: isRegistry
          });
        }
      }
    }
    return allResults;
  } catch (err) {
    console.error('[Offender] SerpAPI search failed:', err.message);
    return [];
  }
}

// ─── State Registry Direct Links ───
function getStateRegistryLinks(first, last, state) {
  const stateKey = (state || '').toLowerCase().trim();
  const links = [
    { name: 'NSOPW (Federal)', url: `https://www.nsopw.gov/search-results?lastName=${encodeURIComponent(last)}&firstName=${encodeURIComponent(first)}` }
  ];

  const stateRegistries = {
    'alabama': 'https://community.alabama.gov/sor/search.aspx',
    'alaska': 'https://dps.alaska.gov/Sorweb/Search.aspx',
    'arizona': 'https://www.azdps.gov/services/public/sex-offender',
    'arkansas': 'https://www.acic.org/offender-search',
    'california': 'https://www.meganslaw.ca.gov/Search.aspx',
    'colorado': 'https://www.colorado.gov/apps/cdps/sor/',
    'connecticut': 'https://www.communitynotification.com/cap_office_disclaimer.php?office=54567',
    'florida': 'https://offender.fdle.state.fl.us/offender/sops/offenderSearch.jsf',
    'georgia': 'https://state.sor.gbi.ga.gov/Sort_Public/',
    'illinois': 'https://isp.illinois.gov/Sor',
    'indiana': 'https://www.icrimewatch.net/indiana.php',
    'louisiana': 'https://www.icrimewatch.net/louisiana.php',
    'maryland': 'https://www.dpscs.state.md.us/sorSearch/',
    'massachusetts': 'https://www.mass.gov/service-details/sex-offender-registry-board-information',
    'michigan': 'https://www.communitynotification.com/cap_office_disclaimer.php?office=55153',
    'minnesota': 'https://coms.doc.state.mn.us/level3/Search.asp',
    'new jersey': 'https://www.njsp.org/sex-offender-registry/',
    'new york': 'https://www.criminaljustice.ny.gov/SomsPublic/search',
    'north carolina': 'https://sexoffender.ncsbi.gov/',
    'ohio': 'https://esorn.ag.state.oh.us/Secured/p1.aspx',
    'pennsylvania': 'https://www.pameganslaw.state.pa.us/',
    'texas': 'https://publicsite.dps.texas.gov/SexOffenderRegistry',
    'virginia': 'https://sex-offender.vsp.virginia.gov/sor/',
    'washington': 'https://www.waspc.org/?c=Sex-Offender-Information'
  };

  if (stateRegistries[stateKey]) {
    links.push({ name: `${state} State Registry`, url: stateRegistries[stateKey] });
  }

  // Family Watchdog (works for all states)
  links.push({
    name: 'Family Watchdog',
    url: `https://www.familywatchdog.us/Search.asp?last_name=${encodeURIComponent(last)}&first_name=${encodeURIComponent(first)}`
  });

  return links;
}
