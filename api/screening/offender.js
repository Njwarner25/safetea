const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
  cors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const user = await authenticate(req);
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { first, last, city, state } = req.query;
  if (!last) return res.status(400).json({ error: 'Last name required' });

  const SERPAPI_KEY = process.env.SERPAPI_KEY || process.env.SERP_API_KEY;
  if (!SERPAPI_KEY) {
    return res.status(500).json({ error: 'Search service not configured' });
  }

  try {
    const fullName = ((first || '') + ' ' + last).trim();
    const locationParts = [city, state].filter(Boolean).join(', ');

    // Run two searches for better coverage
    const queries = [
      `"${fullName}" sex offender` + (locationParts ? ` ${locationParts}` : ''),
      `"${fullName}" offender registry` + (state ? ` ${state}` : '')
    ];

    const allResults = [];
    const seenLinks = new Set();

    for (const query of queries) {
      const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=10`;
      const response = await fetch(url);
      const data = await response.json();

      if (data.error) {
        console.error('[Offender] SerpAPI error:', data.error);
        continue;
      }

      const organic = data.organic_results || [];

      for (const r of organic) {
        const link = (r.link || '').toLowerCase();
        const title = (r.title || '').toLowerCase();
        const snippet = (r.snippet || '').toLowerCase();

        // Skip if we've already seen this link
        if (seenLinks.has(link)) continue;

        // Include result if it's from a registry domain OR mentions relevant terms
        const registryDomains = [
          'nsopw.gov', 'meganslaw', 'offender', 'registry', 'sexoffender',
          'sor.', 'familywatchdog', 'homefacts', 'city-data', 'bustedoffenders',
          'mugshots', 'arrests', 'criminal', 'icrimewatch', 'sheriffalerts',
          'offenderradar', 'neighborhoodscout'
        ];

        const isRegistrySite = registryDomains.some(d => link.includes(d));
        const mentionsOffender = snippet.includes('sex offender') ||
          snippet.includes('registered offender') ||
          snippet.includes('sexual') ||
          title.includes('sex offender') ||
          title.includes('offender');
        const mentionsName = snippet.includes(last.toLowerCase());

        if ((isRegistrySite || mentionsOffender) && mentionsName) {
          seenLinks.add(link);
          allResults.push({
            title: r.title || '',
            snippet: r.snippet || '',
            link: r.link || '',
            source: r.displayed_link || '',
            is_registry: isRegistrySite
          });
        }
      }
    }

    // Sort: registry sites first, then by relevance
    allResults.sort(function(a, b) {
      if (a.is_registry && !b.is_registry) return -1;
      if (!a.is_registry && b.is_registry) return 1;
      return 0;
    });

    return res.status(200).json({
      results: allResults.slice(0, 15),
      query: fullName,
      total: allResults.length
    });
  } catch (err) {
    console.error('[Offender] Search failed:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
