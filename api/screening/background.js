const { cors, authenticate, parseBody } = require('../_utils/auth');

// Data broker sites that collect and post personal info without consent
const DATA_BROKER_SITES = [
    'spokeo.com', 'whitepages.com', 'beenverified.com', 'truthfinder.com',
    'intelius.com', 'peoplefinder.com', 'radaris.com', 'instantcheckmate.com',
    'pipl.com', 'thatsthem.com', 'fastpeoplesearch.com', 'usphonebook.com',
    'anywho.com', 'zabasearch.com', 'peekyou.com', 'publicrecords.com',
    'mylife.com', 'checkpeople.com', 'cocofinder.com', 'truepeoplesearch.com'
];

const SOCIAL_PLATFORMS = [
    { name: 'LinkedIn', domain: 'linkedin.com/in/', icon: 'fab fa-linkedin', color: '#0A66C2' },
    { name: 'Facebook', domain: 'facebook.com/', icon: 'fab fa-facebook', color: '#1877F2' },
    { name: 'Instagram', domain: 'instagram.com/', icon: 'fab fa-instagram', color: '#E4405F' },
    { name: 'X (Twitter)', domain: 'twitter.com/', icon: 'fab fa-x-twitter', color: '#fff' },
    { name: 'TikTok', domain: 'tiktok.com/@', icon: 'fab fa-tiktok', color: '#00f2ea' },
    { name: 'Reddit', domain: 'reddit.com/user/', icon: 'fab fa-reddit', color: '#FF5700' }
];

async function serpSearch(query) {
    const key = process.env.SERPAPI_KEY;
    if (!key) return null;
    try {
        const url = `https://serpapi.com/search.json?q=${encodeURIComponent(query)}&api_key=${key}&num=10`;
        const res = await fetch(url);
        if (!res.ok) return null;
        return await res.json();
    } catch (e) {
        return null;
    }
}

async function googleSearch(query) {
    return await serpSearch(query);
}

function extractProfileUrl(results, domain) {
    if (!results || !results.organic_results) return null;
    for (const r of results.organic_results) {
        if (r.link && r.link.includes(domain)) {
            return {
                url: r.link,
                title: r.title || '',
                snippet: r.snippet || ''
            };
        }
    }
    return null;
}

function extractMultipleResults(results, maxResults = 5) {
    if (!results || !results.organic_results) return [];
    return results.organic_results.slice(0, maxResults).map(r => ({
        url: r.link,
        title: r.title || '',
        snippet: r.snippet || ''
    }));
}

module.exports = async function handler(req, res) {
    cors(res, req);
    if (req.method === 'OPTIONS') return res.status(200).end();
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Sign in to run background checks' });

    // Plus or Pro tier required (admins bypass)
    if (user.role !== 'admin' && (!user.subscription_tier || (user.subscription_tier !== 'plus' && user.subscription_tier !== 'pro'))) {
      return res.status(403).json({ error: 'Background checks require a Plus or Pro subscription', upgrade: true });
    }

    const body = await parseBody(req);
    const { fullName, city, state, age } = body;

    if (!fullName || fullName.trim().length < 2) {
        return res.status(400).json({ error: 'Full name is required' });
    }

    const name = fullName.trim();
    const location = [city, state].filter(Boolean).join(', ');
    const nameLocation = location ? `${name} ${location}` : name;

    const report = {
        subject: name,
        location: location || 'Not specified',
        age: age || null,
        searchedAt: new Date().toISOString(),
        sections: {}
    };

    const hasSerpApi = !!process.env.SERPAPI_KEY;

    if (hasSerpApi) {
        const [
            socialResults,
            mugResults,
            criminalResults,
            dataBrokerResults,
            courtResults,
            newsResults
        ] = await Promise.all([
            serpSearch(`"${name}" ${location} site:linkedin.com OR site:facebook.com OR site:instagram.com OR site:twitter.com`),
            serpSearch(`"${name}" ${location} mugshot OR arrest photo OR booking photo`),
            serpSearch(`"${name}" ${location} criminal record OR arrest OR charged OR convicted -obituary`),
            serpSearch(`"${name}" ${location} site:spokeo.com OR site:whitepages.com OR site:beenverified.com OR site:truthfinder.com OR site:radaris.com OR site:fastpeoplesearch.com OR site:mylife.com`),
            serpSearch(`"${name}" ${location} court case OR court record OR lawsuit OR filed`),
            serpSearch(`"${name}" ${location} news OR article -obituary -linkedin -facebook`)
        ]);

        const socialProfiles = [];
        for (const platform of SOCIAL_PLATFORMS) {
            const profile = extractProfileUrl(socialResults, platform.domain);
            if (profile) {
                socialProfiles.push({
                    platform: platform.name,
                    icon: platform.icon,
                    color: platform.color,
                    url: profile.url,
                    title: profile.title,
                    snippet: profile.snippet
                });
            }
        }

        if (socialProfiles.length < 2) {
            const individualSearches = await Promise.all(
                SOCIAL_PLATFORMS.filter(p => !socialProfiles.find(s => s.platform === p.name))
                    .slice(0, 3)
                    .map(async (platform) => {
                        const r = await serpSearch(`"${name}" ${location} site:${platform.domain}`);
                        const profile = extractProfileUrl(r, platform.domain);
                        if (profile) {
                            return {
                                platform: platform.name,
                                icon: platform.icon,
                                color: platform.color,
                                url: profile.url,
                                title: profile.title,
                                snippet: profile.snippet
                            };
                        }
                        return null;
                    })
            );
            for (const s of individualSearches) {
                if (s) socialProfiles.push(s);
            }
        }

        report.sections.socialMedia = {
            status: socialProfiles.length > 0 ? 'found' : 'none',
            count: socialProfiles.length,
            profiles: socialProfiles
        };

        const mugshots = extractMultipleResults(mugResults, 5).filter(r =>
            r.title.toLowerCase().includes('mugshot') ||
            r.title.toLowerCase().includes('arrest') ||
            r.title.toLowerCase().includes('booking') ||
            r.snippet.toLowerCase().includes('mugshot') ||
            r.snippet.toLowerCase().includes('arrest') ||
            r.snippet.toLowerCase().includes('booking photo') ||
            r.url.includes('mugshot')
        );

        report.sections.mugshots = {
            status: mugshots.length > 0 ? 'found' : 'clear',
            count: mugshots.length,
            results: mugshots
        };

        const criminalHits = extractMultipleResults(criminalResults, 5).filter(r => {
            const text = (r.title + ' ' + r.snippet).toLowerCase();
            return (text.includes('arrest') || text.includes('criminal') ||
                    text.includes('charged') || text.includes('convicted') ||
                    text.includes('felony') || text.includes('misdemeanor')) &&
                   !text.includes('obituary');
        });

        report.sections.criminalRecords = {
            status: criminalHits.length > 0 ? 'found' : 'clear',
            count: criminalHits.length,
            results: criminalHits
        };

        const brokerHits = extractMultipleResults(dataBrokerResults, 10);
        const exposedOn = [];
        for (const hit of brokerHits) {
            for (const site of DATA_BROKER_SITES) {
                if (hit.url.includes(site) && !exposedOn.find(e => e.site === site)) {
                    exposedOn.push({
                        site: site,
                        url: hit.url,
                        title: hit.title,
                        snippet: hit.snippet
                    });
                }
            }
        }

        report.sections.dataBrokers = {
            status: exposedOn.length > 0 ? 'exposed' : 'not_found',
            count: exposedOn.length,
            sites: exposedOn,
            note: exposedOn.length > 0
                ? 'This person\'s information appears on data broker sites that collect and publish personal data, often without consent. These sites aggregate public records, social media, and other sources.'
                : 'No data broker profiles found for this person.'
        };

        const courtHits = extractMultipleResults(courtResults, 5).filter(r => {
            const text = (r.title + ' ' + r.snippet).toLowerCase();
            return text.includes('court') || text.includes('case') ||
                   text.includes('lawsuit') || text.includes('filed') ||
                   text.includes('plaintiff') || text.includes('defendant');
        });

        report.sections.courtRecords = {
            status: courtHits.length > 0 ? 'found' : 'clear',
            count: courtHits.length,
            results: courtHits
        };

        const newsHits = extractMultipleResults(newsResults, 5);
        report.sections.news = {
            status: newsHits.length > 0 ? 'found' : 'none',
            count: newsHits.length,
            results: newsHits
        };

    } else {
        // Fallback: Google News RSS (real web search results, free, no API key) + Wikipedia + DuckDuckGo

        // Google News RSS — returns actual news results (free, no key needed)
        async function googleNewsRSS(query) {
            try {
                const url = `https://news.google.com/rss/search?q=${encodeURIComponent(query)}&hl=en-US&gl=US&ceid=US:en`;
                const res = await fetch(url, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SafeTea/1.0)' }
                });
                const xml = await res.text();
                const results = [];
                // Parse RSS items: <item><title>...</title><link>...</link><description>...</description></item>
                const itemPattern = /<item>([\s\S]*?)<\/item>/g;
                let match;
                while ((match = itemPattern.exec(xml)) !== null) {
                    const item = match[1];
                    const titleMatch = item.match(/<title><!\[CDATA\[([\s\S]*?)\]\]><\/title>/) || item.match(/<title>([\s\S]*?)<\/title>/);
                    const linkMatch = item.match(/<link>([\s\S]*?)<\/link>/);
                    const descMatch = item.match(/<description><!\[CDATA\[([\s\S]*?)\]\]><\/description>/) || item.match(/<description>([\s\S]*?)<\/description>/);
                    const sourceMatch = item.match(/<source[^>]*>([\s\S]*?)<\/source>/);
                    if (titleMatch && linkMatch) {
                        const title = titleMatch[1].replace(/<[^>]*>/g, '').trim();
                        const snippet = descMatch ? descMatch[1].replace(/<[^>]*>/g, '').trim() : '';
                        const source = sourceMatch ? sourceMatch[1].replace(/<[^>]*>/g, '').trim() : '';
                        results.push({
                            url: linkMatch[1].trim(),
                            title: title,
                            snippet: snippet || (source ? `Source: ${source}` : ''),
                            source: source
                        });
                    }
                    if (results.length >= 10) break;
                }
                return results;
            } catch (e) { return []; }
        }

        // Bing Web Search (free, no API key needed for basic results)
        async function bingSearch(query) {
            try {
                const url = `https://www.bing.com/search?q=${encodeURIComponent(query)}&count=10`;
                const res = await fetch(url, {
                    headers: {
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                        'Accept': 'text/html,application/xhtml+xml',
                        'Accept-Language': 'en-US,en;q=0.9'
                    }
                });
                const html = await res.text();
                const results = [];
                // Bing result pattern: <li class="b_algo">...<h2><a href="URL">TITLE</a></h2>...<p>SNIPPET</p>
                const resultPattern = /<li class="b_algo">([\s\S]*?)<\/li>/g;
                let match;
                while ((match = resultPattern.exec(html)) !== null) {
                    const block = match[1];
                    const linkMatch = block.match(/<a[^>]*href="(https?:\/\/[^"]*)"[^>]*>([\s\S]*?)<\/a>/);
                    const snippetMatch = block.match(/<p[^>]*>([\s\S]*?)<\/p>/);
                    if (linkMatch) {
                        results.push({
                            url: linkMatch[1],
                            title: linkMatch[2].replace(/<[^>]*>/g, '').trim(),
                            snippet: snippetMatch ? snippetMatch[1].replace(/<[^>]*>/g, '').trim() : ''
                        });
                    }
                    if (results.length >= 8) break;
                }
                return results;
            } catch (e) { return []; }
        }

        // Wikipedia opensearch
        async function wikiSearch(query, limit = 5) {
            try {
                const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${encodeURIComponent(query)}&limit=${limit}&format=json&origin=*`;
                const res = await fetch(url);
                const data = await res.json();
                const results = [];
                if (data && data[1]) {
                    for (let i = 0; i < data[1].length; i++) {
                        results.push({ url: data[3][i] || '', title: data[1][i] || '', snippet: data[2][i] || '' });
                    }
                }
                return results;
            } catch (e) { return []; }
        }

        // DuckDuckGo instant answer API
        async function ddgInstant(query) {
            try {
                const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
                const res = await fetch(url);
                const data = await res.json();
                const results = [];
                if (data.AbstractText) {
                    results.push({ url: data.AbstractURL || '', title: data.Heading || query, snippet: data.AbstractText });
                }
                if (data.RelatedTopics) {
                    for (const topic of data.RelatedTopics.slice(0, 5)) {
                        if (topic.Text && topic.FirstURL) {
                            results.push({ url: topic.FirstURL, title: topic.Text.substring(0, 120), snippet: topic.Text });
                        }
                    }
                }
                return results;
            } catch (e) { return []; }
        }

        // Run all searches in parallel — Google News RSS is the primary source for real results
        const [
            gnewsPerson,
            gnewsCriminal,
            gnewsArrest,
            bingPerson,
            bingCriminal,
            wikiResults,
            ddgPerson
        ] = await Promise.all([
            googleNewsRSS(`"${name}" ${location}`),
            googleNewsRSS(`"${name}" criminal OR arrest OR charged`),
            googleNewsRSS(`"${name}" ${location} mugshot OR arrest OR court`),
            bingSearch(`"${name}" ${location}`),
            bingSearch(`"${name}" ${location} criminal record OR arrest OR charged`),
            wikiSearch(name),
            ddgInstant(name)
        ]);

        // Combine all results from multiple sources
        const allResults = [
            ...(gnewsPerson || []), ...(gnewsCriminal || []), ...(gnewsArrest || []),
            ...(bingPerson || []), ...(bingCriminal || []),
            ...(ddgPerson || []), ...(wikiResults || [])
        ];

        // Deduplicate by URL
        const seenUrls = new Set();
        const uniqueResults = allResults.filter(r => {
            if (!r.url || seenUrls.has(r.url)) return false;
            seenUrls.add(r.url);
            return true;
        });

        // Parse social profiles
        const socialProfiles = [];
        for (const r of uniqueResults) {
            for (const platform of SOCIAL_PLATFORMS) {
                if (r.url && r.url.includes(platform.domain) && !socialProfiles.find(s => s.platform === platform.name)) {
                    socialProfiles.push({
                        platform: platform.name, icon: platform.icon, color: platform.color,
                        url: r.url, title: r.title, snippet: r.snippet
                    });
                }
            }
        }
        report.sections.socialMedia = {
            status: socialProfiles.length > 0 ? 'found' : 'none',
            count: socialProfiles.length,
            profiles: socialProfiles
        };

        // Criminal/mugshot/court detection from all results
        const criminalHits = [];
        const mugshots = [];
        const courtHits = [];
        for (const r of uniqueResults) {
            const text = (r.title + ' ' + r.snippet).toLowerCase();
            if (text.includes('mugshot') || text.includes('booking photo') || (r.url && r.url.includes('mugshot'))) {
                mugshots.push(r);
            } else if (text.includes('criminal') || text.includes('arrest') || text.includes('charged') ||
                       text.includes('convicted') || text.includes('felony') || text.includes('misdemeanor') ||
                       text.includes('murder') || text.includes('assault') || text.includes('battery') ||
                       text.includes('shooting') || text.includes('indicted') || text.includes('suspect')) {
                criminalHits.push(r);
            } else if (text.includes('court') || text.includes('lawsuit') || text.includes('docket') ||
                       text.includes('filed') || text.includes('plaintiff') || text.includes('defendant')) {
                courtHits.push(r);
            }
        }
        report.sections.mugshots = { status: mugshots.length > 0 ? 'found' : 'clear', count: mugshots.length, results: mugshots.slice(0, 5) };
        report.sections.criminalRecords = { status: criminalHits.length > 0 ? 'found' : 'clear', count: criminalHits.length, results: criminalHits.slice(0, 5) };
        report.sections.courtRecords = { status: courtHits.length > 0 ? 'found' : 'clear', count: courtHits.length, results: courtHits.slice(0, 5) };

        // Data broker exposure
        const exposedOn = [];
        for (const r of uniqueResults) {
            for (const site of DATA_BROKER_SITES) {
                if (r.url && r.url.includes(site) && !exposedOn.find(e => e.site === site)) {
                    exposedOn.push({ site, url: r.url, title: r.title, snippet: r.snippet });
                }
            }
        }
        report.sections.dataBrokers = {
            status: exposedOn.length > 0 ? 'exposed' : 'not_found',
            count: exposedOn.length,
            sites: exposedOn,
            note: exposedOn.length > 0
                ? 'This person\'s information appears on data broker sites.'
                : 'No data broker profiles found.'
        };

        // News — everything that's not social/broker/criminal already categorized
        const categorizedUrls = new Set([
            ...socialProfiles.map(s => s.url),
            ...mugshots.map(m => m.url),
            ...criminalHits.map(c => c.url),
            ...courtHits.map(c => c.url),
            ...exposedOn.map(e => e.url)
        ]);

        const newsHits = uniqueResults.filter(r =>
            !categorizedUrls.has(r.url) &&
            !SOCIAL_PLATFORMS.some(p => r.url.includes(p.domain)) &&
            !DATA_BROKER_SITES.some(s => r.url.includes(s))
        );

        report.sections.news = {
            status: newsHits.length > 0 ? 'found' : 'none',
            count: Math.min(newsHits.length, 10),
            results: newsHits.slice(0, 10)
        };
    }

    let riskScore = 0;
    let riskFlags = [];

    if (report.sections.mugshots?.count > 0) { riskScore += 35; riskFlags.push('Mugshot/arrest photos found'); }
    if (report.sections.criminalRecords?.count > 0) { riskScore += 30; riskFlags.push('Criminal record mentions found'); }
    if (report.sections.courtRecords?.count > 0) { riskScore += 15; riskFlags.push('Court records found'); }
    if (report.sections.dataBrokers?.count > 3) { riskScore += 10; riskFlags.push('Personal info widely exposed on data broker sites'); }
    if (report.sections.socialMedia?.count === 0) { riskScore += 10; riskFlags.push('No social media presence found — could indicate fake identity'); }

    let riskLevel = 'low';
    if (riskScore >= 50) riskLevel = 'high';
    else if (riskScore >= 25) riskLevel = 'medium';

    report.riskAssessment = {
        score: Math.min(riskScore, 100),
        level: riskLevel,
        flags: riskFlags
    };

    return res.status(200).json(report);

  } catch (err) {
    console.error('[Background Check] Error:', err);
    return res.status(500).json({ error: 'Background check failed. Please try again.' });
  }
};
