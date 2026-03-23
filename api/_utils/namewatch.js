const { getMany, getOne, run } = require('./db');

// Generate search terms from a display name
function generateSearchTerms(name) {
    const terms = [];
    const clean = name.trim();
    if (!clean) return terms;

    terms.push(clean.toLowerCase());

    const parts = clean.split(/\s+/);
    parts.forEach(p => {
        const lower = p.toLowerCase().replace(/[.]/g, '');
        if (lower.length > 1 && !terms.includes(lower)) terms.push(lower);
    });

    if (parts.length >= 2) {
        const initials = parts.map(p => p[0]).join('').toLowerCase();
        if (!terms.includes(initials)) terms.push(initials);

        const firstLast = (parts[0] + ' ' + parts[parts.length - 1][0]).toLowerCase();
        if (!terms.includes(firstLast)) terms.push(firstLast);
        const firstLastDot = firstLast + '.';
        if (!terms.includes(firstLastDot)) terms.push(firstLastDot);
    }

    return terms;
}

// Check a new post against all watched names in the same city
async function checkNewPostAgainstWatchedNames(postId, postContent, postCity) {
    try {
        const watchedNames = await getMany(
            `SELECT wn.id, wn.search_terms, wn.user_id FROM watched_names wn
             JOIN users u ON wn.user_id = u.id
             WHERE u.city = $1`,
            [postCity]
        );

        const contentLower = postContent.toLowerCase();

        for (const wn of watchedNames) {
            const terms = wn.search_terms || [];
            for (const term of terms) {
                if (contentLower.includes(term)) {
                    const matchType = term.length <= 3 ? 'initials' : 'exact';
                    try {
                        await run(
                            `INSERT INTO name_watch_matches (watched_name_id, post_id, match_type, matched_term)
                             VALUES ($1, $2, $3, $4) ON CONFLICT (watched_name_id, post_id) DO NOTHING`,
                            [wn.id, postId, matchType, term]
                        );
                        await run(
                            `UPDATE watched_names SET
                              match_count = (SELECT COUNT(*) FROM name_watch_matches WHERE watched_name_id = $1),
                              last_match_at = NOW()
                             WHERE id = $1`,
                            [wn.id]
                        );
                    } catch (e) { /* ignore duplicate */ }
                    break;
                }
            }
        }
    } catch (err) {
        console.error('Name Watch matching error:', err);
    }
}

// Scan existing posts for a newly added watched name
async function scanExistingPosts(watchedNameId, searchTerms, userCity) {
    try {
        const posts = await getMany(
            `SELECT id, body FROM posts
             WHERE city = $1 AND created_at > NOW() - INTERVAL '30 days'
             ORDER BY created_at DESC LIMIT 200`,
            [userCity]
        );

        for (const post of posts) {
            const contentLower = (post.body || '').toLowerCase();
            for (const term of searchTerms) {
                if (contentLower.includes(term)) {
                    const matchType = term.length <= 3 ? 'initials' : 'exact';
                    try {
                        await run(
                            `INSERT INTO name_watch_matches (watched_name_id, post_id, match_type, matched_term)
                             VALUES ($1, $2, $3, $4) ON CONFLICT (watched_name_id, post_id) DO NOTHING`,
                            [watchedNameId, post.id, matchType, term]
                        );
                    } catch (e) { /* ignore */ }
                    break;
                }
            }
        }

        const countResult = await getOne(
            'SELECT COUNT(*) as count FROM name_watch_matches WHERE watched_name_id = $1',
            [watchedNameId]
        );
        await run(
            'UPDATE watched_names SET match_count = $1 WHERE id = $2',
            [parseInt(countResult.count), watchedNameId]
        );
    } catch (err) {
        console.error('Scan existing posts error:', err);
    }
}

module.exports = { generateSearchTerms, checkNewPostAgainstWatchedNames, scanExistingPosts };
