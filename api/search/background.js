const { authenticate, cors } = require('../_utils/auth');

module.exports = async function handler(req, res) {
    cors(res);
    if (req.method === 'OPTIONS') return res.status(200).end();

    const user = await authenticate(req);
    if (!user) return res.status(401).json({ error: 'Not authenticated' });

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { name, city, state, age } = req.body;
        if (!name || name.trim().length < 2) {
            return res.status(400).json({ error: 'Name is required' });
        }

        const searchName = name.trim();
        const location = [city, state].filter(Boolean).join(', ');

        // Build search queries for different categories
        const queries = [
            `"${searchName}" ${location} criminal charges arrest`,
            `"${searchName}" ${location} sex offender registry`,
            `"${searchName}" ${location} court records lawsuit`,
            `"${searchName}" ${location}`,
        ];

        // Use Google Custom Search API if configured, otherwise use scraping approach
        const googleApiKey = process.env.GOOGLE_SEARCH_API_KEY;
        const googleCx = process.env.GOOGLE_SEARCH_CX;

        let allResults = [];

        if (googleApiKey && googleCx) {
            // Use Google Custom Search JSON API
            for (const query of queries) {
                try {
                    const url = `https://www.googleapis.com/customsearch/v1?key=${googleApiKey}&cx=${googleCx}&q=${encodeURIComponent(query)}&num=5`;
                    const response = await fetch(url);
                    const data = await response.json();
                    if (data.items) {
                        allResults.push(...data.items.map(item => ({
                            title: item.title,
                            snippet: item.snippet,
                            link: item.link,
                            source: new URL(item.link).hostname
                        })));
                    }
                } catch (err) {
                    console.error('Google search error:', err.message);
                }
            }
        } else {
            // Fallback: use DuckDuckGo instant answer API (no key required)
            for (const query of queries.slice(0, 2)) {
                try {
                    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
                    const response = await fetch(url);
                    const data = await response.json();

                    if (data.AbstractText) {
                        allResults.push({
                            title: data.Heading || searchName,
                            snippet: data.AbstractText,
                            link: data.AbstractURL || '',
                            source: data.AbstractSource || 'DuckDuckGo'
                        });
                    }
                    if (data.RelatedTopics) {
                        data.RelatedTopics.slice(0, 5).forEach(topic => {
                            if (topic.Text) {
                                allResults.push({
                                    title: topic.Text.substring(0, 80),
                                    snippet: topic.Text,
                                    link: topic.FirstURL || '',
                                    source: 'DuckDuckGo'
                                });
                            }
                        });
                    }
                } catch (err) {
                    console.error('DuckDuckGo search error:', err.message);
                }
            }

            // Also try Google via SerpAPI-style or basic fetch
            try {
                const query = `"${searchName}" ${location} criminal OR arrest OR charges OR "sex offender"`;
                const url = `https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`;
                const response = await fetch(url, {
                    headers: { 'User-Agent': 'SafeTea Background Check/1.0' }
                });
                const html = await response.text();

                // Extract result snippets from DuckDuckGo HTML
                const resultPattern = /<a[^>]*class="result__a"[^>]*href="([^"]*)"[^>]*>([^<]*)<\/a>/g;
                const snippetPattern = /<a[^>]*class="result__snippet"[^>]*>([^<]*)<\/a>/g;
                let match;
                const links = [];
                const titles = [];
                const snippets = [];

                while ((match = resultPattern.exec(html)) !== null) {
                    links.push(match[1]);
                    titles.push(match[2]);
                }
                while ((match = snippetPattern.exec(html)) !== null) {
                    snippets.push(match[1]);
                }

                for (let i = 0; i < Math.min(links.length, 10); i++) {
                    let cleanLink = links[i];
                    // DuckDuckGo wraps links in a redirect
                    if (cleanLink.includes('uddg=')) {
                        try { cleanLink = decodeURIComponent(cleanLink.split('uddg=')[1].split('&')[0]); } catch(e) {}
                    }
                    allResults.push({
                        title: titles[i] || 'Result',
                        snippet: snippets[i] || '',
                        link: cleanLink,
                        source: cleanLink ? new URL(cleanLink).hostname : 'web'
                    });
                }
            } catch (err) {
                console.error('HTML search error:', err.message);
            }
        }

        // Deduplicate by link
        const seen = new Set();
        const uniqueResults = allResults.filter(r => {
            if (!r.link || seen.has(r.link)) return false;
            seen.add(r.link);
            return true;
        });

        // Local county sex offender registry links for SafeTea cities
        const countyRegistries = {
            'atlanta': {
                label: 'Georgia Sex Offender Registry',
                url: 'https://state.sor.gbi.ga.gov/Sort_Public/',
                county: 'Fulton County / DeKalb County'
            },
            'new york': {
                label: 'New York Sex Offender Registry (DCJS)',
                url: 'https://www.criminaljustice.ny.gov/SomsPublic/search',
                county: 'New York County (Manhattan) / Kings County (Brooklyn) / Queens County'
            },
            'los angeles': {
                label: 'California Megan\'s Law Registry',
                url: 'https://www.meganslaw.ca.gov/Search.aspx',
                county: 'Los Angeles County'
            },
            'chicago': {
                label: 'Illinois Sex Offender Registry',
                url: 'https://isp.illinois.gov/Sor',
                county: 'Cook County'
            },
            'houston': {
                label: 'Texas Sex Offender Registry (DPS)',
                url: 'https://publicsite.dps.texas.gov/SexOffenderRegistry/Search',
                county: 'Harris County'
            },
            'miami': {
                label: 'Florida Sexual Offenders & Predators (FDLE)',
                url: 'https://offender.fdle.state.fl.us/offender/sops/offenderSearch.jsf',
                county: 'Miami-Dade County'
            },
            // Pending cities (pre-loaded for when they launch)
            'dallas': {
                label: 'Texas Sex Offender Registry (DPS)',
                url: 'https://publicsite.dps.texas.gov/SexOffenderRegistry/Search',
                county: 'Dallas County'
            },
            'san francisco': {
                label: 'California Megan\'s Law Registry',
                url: 'https://www.meganslaw.ca.gov/Search.aspx',
                county: 'San Francisco County'
            },
            'nashville': {
                label: 'Tennessee Sex Offender Registry (TBI)',
                url: 'https://sor.tbi.tn.gov/SearchOffender',
                county: 'Davidson County'
            },
            'phoenix': {
                label: 'Arizona Sex Offender Registry (DPS)',
                url: 'https://www.azdps.gov/services/public/sex-offender',
                county: 'Maricopa County'
            },
            'philadelphia': {
                label: 'Pennsylvania Megan\'s Law Registry (PSP)',
                url: 'https://www.meganslaw.psp.pa.gov/Search/OffenderSearchDetails',
                county: 'Philadelphia County'
            },
            'seattle': {
                label: 'Washington Sex Offender Registry (WASPC)',
                url: 'https://www.waspc.org/sex-offender-information',
                county: 'King County'
            },
            'denver': {
                label: 'Colorado Sex Offender Registry (CBI)',
                url: 'https://apps.colorado.gov/apps/dps/sor/',
                county: 'Denver County'
            },
            'charlotte': {
                label: 'North Carolina Sex Offender Registry (SBI)',
                url: 'https://sexoffender.ncsbi.gov/',
                county: 'Mecklenburg County'
            }
        };

        // Categorize results
        const categories = {
            criminal: { label: 'Criminal Records', icon: 'gavel', results: [] },
            sex_offender: { label: 'Sex Offender Registry', icon: 'user-shield', results: [], registries: [] },
            court: { label: 'Court & Legal Records', icon: 'balance-scale', results: [] },
            news: { label: 'News & Media', icon: 'newspaper', results: [] },
            social: { label: 'Social Media & Online Presence', icon: 'globe', results: [] },
            other: { label: 'Other Public Records', icon: 'file-alt', results: [] }
        };

        // Always add the national registry link
        categories.sex_offender.registries.push({
            label: 'National Sex Offender Public Website (NSOPW)',
            url: 'https://www.nsopw.gov/Search',
            county: 'Federal — All States'
        });

        // Add local county registry based on the search city
        if (city) {
            const cityKey = city.trim().toLowerCase();
            if (countyRegistries[cityKey]) {
                categories.sex_offender.registries.push(countyRegistries[cityKey]);
            }
        }
        // Also check state to add all matching city registries
        if (state) {
            const stateKey = state.trim().toLowerCase();
            const stateMap = {
                'ga': 'georgia', 'georgia': 'georgia',
                'ny': 'new york', 'new york': 'new york',
                'ca': 'california', 'california': 'california',
                'il': 'illinois', 'illinois': 'illinois',
                'tx': 'texas', 'texas': 'texas',
                'fl': 'florida', 'florida': 'florida',
                'tn': 'tennessee', 'tennessee': 'tennessee',
                'az': 'arizona', 'arizona': 'arizona',
                'pa': 'pennsylvania', 'pennsylvania': 'pennsylvania',
                'wa': 'washington', 'washington': 'washington',
                'co': 'colorado', 'colorado': 'colorado',
                'nc': 'north carolina', 'north carolina': 'north carolina'
            };
            const stateFull = stateMap[stateKey];
            if (stateFull && !city) {
                // If no city but state provided, add all registries for that state
                Object.entries(countyRegistries).forEach(([, reg]) => {
                    const alreadyAdded = categories.sex_offender.registries.some(r => r.url === reg.url);
                    if (!alreadyAdded) {
                        const regState = reg.url.toLowerCase();
                        if (
                            (stateFull === 'georgia' && regState.includes('ga.gov')) ||
                            (stateFull === 'new york' && regState.includes('ny.gov')) ||
                            (stateFull === 'california' && regState.includes('meganslaw.ca.gov')) ||
                            (stateFull === 'illinois' && regState.includes('illinois.gov')) ||
                            (stateFull === 'texas' && regState.includes('texas.gov')) ||
                            (stateFull === 'florida' && regState.includes('fl.us')) ||
                            (stateFull === 'tennessee' && regState.includes('tn.gov')) ||
                            (stateFull === 'arizona' && regState.includes('azdps.gov')) ||
                            (stateFull === 'pennsylvania' && regState.includes('pa.gov')) ||
                            (stateFull === 'washington' && regState.includes('waspc.org')) ||
                            (stateFull === 'colorado' && regState.includes('colorado.gov')) ||
                            (stateFull === 'north carolina' && regState.includes('ncsbi.gov'))
                        ) {
                            categories.sex_offender.registries.push(reg);
                        }
                    }
                });
            }
        }

        uniqueResults.forEach(r => {
            const text = (r.title + ' ' + r.snippet + ' ' + r.link).toLowerCase();
            if (text.includes('sex offend') || text.includes('nsopw') || text.includes('megan')) {
                categories.sex_offender.results.push(r);
            } else if (text.includes('criminal') || text.includes('arrest') || text.includes('charg') || text.includes('inmate') || text.includes('mugshot') || text.includes('murder') || text.includes('homicide')) {
                categories.criminal.results.push(r);
            } else if (text.includes('court') || text.includes('lawsuit') || text.includes('docket') || text.includes('case') || text.includes('judge')) {
                categories.court.results.push(r);
            } else if (text.includes('news') || r.source.includes('news') || r.source.includes('cnn') || r.source.includes('fox') || r.source.includes('abc') || r.source.includes('nbc') || r.source.includes('tribune') || r.source.includes('herald') || r.source.includes('post') || r.source.includes('times')) {
                categories.news.results.push(r);
            } else if (text.includes('facebook') || text.includes('linkedin') || text.includes('twitter') || text.includes('instagram') || text.includes('tiktok')) {
                categories.social.results.push(r);
            } else {
                categories.other.results.push(r);
            }
        });

        return res.status(200).json({
            name: searchName,
            location: location || 'Not specified',
            age: age || null,
            searched_at: new Date().toISOString(),
            total_results: uniqueResults.length,
            categories,
            disclaimer: 'SafeTea compiles publicly available information from web searches. This is not a certified background check. Always meet in public places and tell someone where you are going.'
        });

    } catch (error) {
        console.error('Background check error:', error);
        return res.status(500).json({ error: 'Background check failed. Please try again.' });
    }
};
