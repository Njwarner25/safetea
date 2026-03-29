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
    const query = `"${fullName}" sex offender registry` + (locationParts ? ` ${locationParts}` : '');

    const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${SERPAPI_KEY}&num=10`;
    const response = await fetch(url);
    const data = await response.json();

    if (data.error) {
      console.error('[Offender] SerpAPI error:', data.error);
      return res.status(500).json({ error: 'Search failed' });
    }

    const organic = data.organic_results || [];

    // Filter to results likely from offender registries
    const registryDomains = ['nsopw.gov', 'meganslaw', 'offender', 'registry', 'sexoffender', 'sor.', 'familywatchdog', 'homefacts', 'city-data'];
    const results = organic
      .filter(r => {
        const link = (r.link || '').toLowerCase();
        const title = (r.title || '').toLowerCase();
        const snippet = (r.snippet || '').toLowerCase();
        return registryDomains.some(d => link.includes(d) || title.includes(d)) ||
               snippet.includes('sex offender') || snippet.includes('registered offender');
      })
      .map(r => ({
        title: r.title || '',
        snippet: r.snippet || '',
        link: r.link || '',
        source: r.displayed_link || ''
      }));

    return res.status(200).json({ results, query: fullName, total: results.length });
  } catch (err) {
    console.error('[Offender] Search failed:', err);
    return res.status(500).json({ error: 'Search failed', details: err.message });
  }
};
