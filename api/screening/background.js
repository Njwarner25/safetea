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
    // Fallback: use Google Custom Search if available, otherwise SerpAPI
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

    // Run all searches in parallel for speed
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
            // 1. Social Media Search
            serpSearch(`"${name}" ${location} site:linkedin.com OR site:facebook.com OR site:instagram.com OR site:twitter.com`),
            // 2. Mugshot Search
            serpSearch(`"${name}" ${location} mugshot OR arrest photo OR booking photo`),
            // 3. Criminal Records
            serpSearch(`"${name}" ${location} criminal record OR arrest OR charged OR convicted -obituary`),
            // 4. Data Broker / People Search Sites
            serpSearch(`"${name}" ${location} site:spokeo.com OR site:whitepages.com OR site:beenverified.com OR site:truthfinder.com OR site:radaris.com OR site:fastpeoplesearch.com OR site:mylife.com`),
            // 5. Court Records
            serpSearch(`"${name}" ${location} court case OR court record OR lawsuit OR filed`),
            // 6. News / Public Mentions
            serpSearch(`"${name}" ${location} news OR article -obituary -linkedin -facebook`)
        ]);

        // ---- SOCIAL MEDIA ----
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

        // Also do individual platform searches if we didn't find enough
        if (socialProfiles.length < 2) {
            const individualSearches = await Promise.all(
                SOCIAL_PLATFORMS.filter(p => !socialProfiles.find(s => s.platform === p.name))
                    .slice(0, 3) // limit to 3 extra searches
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

        // ---- MUGSHOTS ----
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

        // ---- CRIMINAL RECORDS ----
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

        // ---- DATA BROKER EXPOSURE ----
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

        // ---- COURT RECORDS ----
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

        // ---- NEWS / PUBLIC MENTIONS ----
        const newsHits = extractMultipleResults(newsResults, 5);
        report.sections.news = {
            status: newsHits.length > 0 ? 'found' : 'none',
            count: newsHits.length,
            results: newsHits
        };

    } else {
        // No SerpAPI key — return guidance on where to search manually
        report.sections.socialMedia = { status: 'manual', profiles: [], note: 'SerpAPI key not configured. Search manually on LinkedIn, Facebook, Instagram.' };
        report.sections.mugshots = { status: 'manual', results: [], note: 'Search manually on mugshots.com or local county sheriff sites.' };
        report.sections.criminalRecords = { status: 'manual', results: [], note: 'Check your county court clerk website or use a paid service.' };
        report.sections.dataBrokers = { status: 'manual', sites: [], note: 'Check Spokeo, WhitePages, BeenVerified, TruthFinder manually.' };
        report.sections.courtRecords = { status: 'manual', results: [], note: 'Search PACER or your state court system.' };
        report.sections.news = { status: 'manual', results: [], note: 'Search Google News for the person\'s name.' };
    }

    // ---- RISK ASSESSMENT ----
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
};
