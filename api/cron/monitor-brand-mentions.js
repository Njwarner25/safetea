/**
 * Vercel Cron Job: Brand-mention monitor
 *
 * { "path": "/api/cron/monitor-brand-mentions", "schedule": "0 8 * * *" }
 *
 * Runs daily at 8am UTC. Surfaces fresh public mentions of SafeTea and the
 * AWDTSG-alternative niche from Reddit and (optionally) Google Search via
 * SerpAPI. Deduplicates against the brand_mentions table so the same thread
 * is never emailed twice. Sends a single digest to all admin users.
 */

const { getMany, getOne, run } = require('../_utils/db');
const { cors } = require('../_utils/auth');
const { sendEmail, wrapHtml } = require('../../services/email');

// What we watch. Tuned for the AWDTSG-aware audience and the SafeTea brand window.
// Edit cautiously — a too-broad query (e.g., just "dating") will flood the digest.
const SUBREDDITS = [
  'dating_advice',
  'AskWomen',
  'TwoXChromosomes',
  'datingoverthirty',
  'Tinder',
  'Bumble',
  'hingeapp'
];

const REDDIT_QUERIES = [
  '"AWDTSG"',
  '"are we dating the same guy"',
  '"SafeTea"',
  '"is he safe to date"',
  '"AWDTSG alternative"'
];

const WEB_QUERIES = [
  '"SafeTea" dating',
  '"safetea.app"',
  '"AWDTSG" alternative women safety'
];

// Filter out our own domains and obvious noise from web search.
const SELF_DOMAINS = ['safetea.app', 'getsafetea.app', 'github.com/njwarner25'];
const NOISE_DOMAINS = ['pinterest.com', 'amazon.com'];

const RECENCY_HOURS = 36; // include items posted in the last 36h
const MAX_PER_SOURCE = 20; // safety cap per source per run

async function fetchJSON(url, opts) {
  const res = await fetch(url, Object.assign({ headers: { 'User-Agent': 'SafeTea-BrandMonitor/1.0' } }, opts || {}));
  if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
  return res.json();
}

// Reddit search (unauthenticated public JSON endpoint).
async function searchReddit() {
  const found = [];
  const cutoff = Date.now() - RECENCY_HOURS * 3600 * 1000;
  for (const sub of SUBREDDITS) {
    for (const q of REDDIT_QUERIES) {
      const url = 'https://www.reddit.com/r/' + sub + '/search.json?restrict_sr=1&sort=new&limit=10&q=' + encodeURIComponent(q);
      try {
        const data = await fetchJSON(url);
        const children = (data && data.data && data.data.children) || [];
        for (const c of children) {
          const p = c.data;
          if (!p) continue;
          const created = (p.created_utc || 0) * 1000;
          if (created < cutoff) continue;
          found.push({
            source: 'reddit',
            external_id: p.id,
            url: 'https://www.reddit.com' + p.permalink,
            title: p.title,
            snippet: (p.selftext || '').slice(0, 240),
            sub: 'r/' + sub,
            query: q,
            posted_at: new Date(created).toISOString()
          });
          if (found.length >= MAX_PER_SOURCE * SUBREDDITS.length) break;
        }
      } catch (err) {
        console.warn('[BrandMonitor] Reddit search failed for', sub, q, ':', err.message);
      }
    }
  }
  return found;
}

// Web search via SerpAPI. Skipped silently if SERPAPI_KEY isn't configured.
async function searchWeb() {
  const key = process.env.SERPAPI_KEY;
  if (!key) return [];
  const found = [];
  for (const q of WEB_QUERIES) {
    const url = 'https://serpapi.com/search.json?engine=google&num=10&q=' + encodeURIComponent(q) + '&api_key=' + key;
    try {
      const data = await fetchJSON(url);
      const organic = data.organic_results || [];
      for (const r of organic) {
        if (!r.link) continue;
        const linkLower = r.link.toLowerCase();
        if (SELF_DOMAINS.some(function (d) { return linkLower.includes(d); })) continue;
        if (NOISE_DOMAINS.some(function (d) { return linkLower.includes(d); })) continue;
        found.push({
          source: 'web',
          external_id: r.link, // URL is the dedupe key for web results
          url: r.link,
          title: r.title || '(untitled)',
          snippet: (r.snippet || '').slice(0, 240),
          query: q,
          posted_at: r.date || null
        });
        if (found.length >= MAX_PER_SOURCE * WEB_QUERIES.length) break;
      }
    } catch (err) {
      console.warn('[BrandMonitor] Web search failed for', q, ':', err.message);
    }
  }
  return found;
}

// Returns only the items we haven't already logged. Inserts new ones for next time.
async function dedupe(mentions) {
  const fresh = [];
  for (const m of mentions) {
    try {
      const exists = await getOne(
        `SELECT 1 AS hit FROM brand_mentions WHERE source = $1 AND external_id = $2`,
        [m.source, m.external_id]
      );
      if (exists) continue;
      await run(
        `INSERT INTO brand_mentions (source, external_id, url, title, snippet, posted_at) VALUES ($1, $2, $3, $4, $5, $6)`,
        [m.source, m.external_id, m.url, m.title || '', m.snippet || '', m.posted_at || null]
      );
      fresh.push(m);
    } catch (err) {
      // Hitting the unique constraint means we've already seen it; safe to skip.
      console.warn('[BrandMonitor] dedupe write failed:', err.message);
    }
  }
  return fresh;
}

function escapeHtml(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function renderDigestHtml(reddit, web) {
  function block(items, label) {
    if (!items.length) return '<p style="color:#8080A0;font-size:13px;">No fresh ' + label + ' mentions in the last ' + RECENCY_HOURS + 'h.</p>';
    return items.map(function (m) {
      var meta = m.sub ? m.sub + ' &middot; ' + escapeHtml(m.query) : escapeHtml(m.query || '');
      return (
        '<div style="border:1px solid rgba(255,255,255,0.06);border-radius:10px;padding:14px;margin-bottom:10px;background:rgba(255,255,255,0.02);">' +
          '<div style="font-size:11px;color:#8080A0;margin-bottom:4px;">' + meta + '</div>' +
          '<div style="font-weight:600;font-size:14px;color:#fff;margin-bottom:6px;"><a href="' + escapeHtml(m.url) + '" style="color:#E8A0B5;text-decoration:none;">' + escapeHtml(m.title || '(untitled)') + '</a></div>' +
          (m.snippet ? '<div style="color:#ccc;font-size:13px;line-height:1.5;">' + escapeHtml(m.snippet) + '</div>' : '') +
        '</div>'
      );
    }).join('');
  }
  return wrapHtml(
    '<h2 style="color:#fff;font-size:20px;margin:0 0 8px;">Brand-mention digest</h2>' +
    '<p style="color:#8080A0;font-size:13px;margin:0 0 20px;">Fresh public mentions in the last ' + RECENCY_HOURS + ' hours that we haven\'t emailed about before.</p>' +
    '<h3 style="color:#E8A0B5;font-size:15px;margin:16px 0 8px;">Reddit (' + reddit.length + ')</h3>' +
    block(reddit, 'Reddit') +
    '<h3 style="color:#E8A0B5;font-size:15px;margin:24px 0 8px;">Web (' + web.length + ')</h3>' +
    block(web, 'web') +
    '<p style="color:#666;font-size:11px;margin-top:24px;">If something here deserves a reply, the comment templates live in <code>docs/marketing/social/comment-engagement-templates.md</code>. Reply within the day; older threads decay fast.</p>'
  );
}

module.exports = async function handler(req, res) {
  cors(res, req);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const cronHeader = req.headers['x-vercel-cron'];
  const authHeader = req.headers.authorization || '';
  const providedSecret = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  const expected = process.env.CRON_SECRET;
  if (!cronHeader && (!expected || providedSecret !== expected)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const results = { timestamp: new Date().toISOString(), reddit: 0, web: 0, emailed_to: 0, errors: [] };

  try {
    const [redditRaw, webRaw] = await Promise.all([searchReddit(), searchWeb()]);
    const reddit = await dedupe(redditRaw);
    const web = await dedupe(webRaw);
    results.reddit = reddit.length;
    results.web = web.length;

    if (reddit.length === 0 && web.length === 0) {
      console.log('[BrandMonitor] No fresh mentions; skipping digest email.');
      return res.status(200).json(Object.assign({ skipped: 'no_fresh_mentions' }, results));
    }

    const html = renderDigestHtml(reddit, web);
    const subject = 'SafeTea brand mentions — ' + reddit.length + ' Reddit, ' + web.length + ' web';

    const admins = await getMany(`SELECT email FROM users WHERE role = 'admin' AND email IS NOT NULL`).catch(function () { return []; });
    for (const a of admins) {
      try {
        await sendEmail({ to: a.email, subject: subject, html: html });
        results.emailed_to++;
      } catch (err) {
        results.errors.push({ admin: a.email, error: err.message });
      }
    }

    console.log('[BrandMonitor]', reddit.length, 'reddit,', web.length, 'web, emailed', results.emailed_to);
    return res.status(200).json(results);
  } catch (err) {
    console.error('[BrandMonitor] Fatal:', err);
    return res.status(500).json({ error: 'Brand monitor failed', details: err.message });
  }
};
