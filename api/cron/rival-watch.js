/**
 * GET /api/cron/rival-watch
 *
 * Scheduled fetch of competitor landing pages. For each URL:
 *   1. HTTP GET (with a real browser UA so we don't get blocked)
 *   2. Strip scripts/styles + collapse whitespace → normalized text
 *   3. sha256 the normalized text → content_hash
 *   4. Compare against the previous row for the same URL
 *   5. INSERT a snapshot row
 *   6. If the hash differs from the previous, flag changed_from_previous
 *      and email info@getsafetea.app with a summary + the site's new
 *      tagline / feature mentions so we can see what they copied.
 *
 * Auth: Vercel cron only (x-vercel-cron header) OR
 *       x-migrate-secret for manual dispatch during testing.
 *
 * Schedule: every 6 hours, configured in vercel.json.
 */

'use strict';

const crypto = require('crypto');
const { getOne, run } = require('../_utils/db');
const emailSvc = require('../../services/email');

const WATCH_URLS = [
  'https://www.safeteaapp.com/',
  'https://safeteaapp.com/',
];

// Keywords lifted from SafeTea's own content. If any appear on the
// rival's site when they previously didn't, that's the forensic
// signal the founder wants to see.
const COPYCAT_MARKERS = [
  'Stay connected, stay safe',
  'Safety Vault',
  'verified identity',
  'Check-In',
  'SafeLink',
  'SafeTea Pulse',
  'Name Watch',
  'veteran-founded',
  'USPTO',
  'DMCA-1071746',
  'GET SAFETEA APP LLC',
  'Tea Talk',
  'Record & Protect',
];

function normalize(html) {
  if (!html) return '';
  // Drop script + style blocks outright — they can churn without meaning.
  const stripped = String(html)
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
  return stripped.slice(0, 20000); // cap at 20KB — typical marketing page fits
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

async function fetchPage(url) {
  const controller = new AbortController();
  const t = setTimeout(function () { controller.abort(); }, 15000);
  try {
    const resp = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
      },
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await resp.text();
    return { status: resp.status, body: text };
  } finally {
    clearTimeout(t);
  }
}

function findMarkers(normText) {
  const hits = [];
  const lower = normText.toLowerCase();
  for (const m of COPYCAT_MARKERS) {
    if (lower.indexOf(m.toLowerCase()) !== -1) hits.push(m);
  }
  return hits;
}

function summarizeDiff(prevText, newText, markers) {
  const parts = [];
  parts.push(`Length: ${prevText ? prevText.length : 0} → ${newText.length} chars`);
  if (markers.length) parts.push(`SafeTea-copycat markers now present on their site: ${markers.join(', ')}`);
  // Crude first-diff preview: show the first 400 chars of the new content
  parts.push(`New content preview:\n"${newText.slice(0, 400)}${newText.length > 400 ? '…' : ''}"`);
  return parts.join('\n\n');
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();

  // Auth: Vercel cron signs its requests with x-vercel-cron.
  // Manual/QA dispatch via x-migrate-secret: MIGRATE_SECRET.
  const isCron = !!req.headers['x-vercel-cron'];
  const secret = req.headers['x-migrate-secret'] || req.query.secret;
  if (!isCron && secret !== process.env.MIGRATE_SECRET) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const results = [];
  for (const url of WATCH_URLS) {
    const out = { url, fetched_at: new Date().toISOString() };
    try {
      const resp = await fetchPage(url);
      const normText = normalize(resp.body);
      const hash = sha256(normText);

      const prev = await getOne(
        `SELECT content_hash, content_text FROM rival_snapshots
         WHERE url = $1 ORDER BY fetched_at DESC LIMIT 1`,
        [url]
      ).catch(function () { return null; });

      const changed = prev && prev.content_hash && prev.content_hash !== hash;
      const first = !prev;
      const markers = findMarkers(normText);
      const diff = changed ? summarizeDiff(prev.content_text || '', normText, markers) : null;

      try {
        await run(
          `INSERT INTO rival_snapshots (url, status_code, content_hash, content_length, content_text, changed_from_previous, diff_summary)
           VALUES ($1, $2, $3, $4, $5, $6, $7)`,
          [url, resp.status, hash, normText.length, normText, !!changed, diff]
        );
      } catch (e) {
        out.db_error = e && e.message;
      }

      out.status_code = resp.status;
      out.content_hash = hash;
      out.content_length = normText.length;
      out.first_snapshot = first;
      out.changed = !!changed;
      out.copycat_markers = markers;

      // Email alert only when a change is detected (skip first run
      // to avoid spamming on baseline capture).
      if (changed) {
        const subject = markers.length
          ? `[SafeTea] ⚠️ Rival site changed AND now mentions SafeTea features`
          : `[SafeTea] Rival site changed: ${url}`;
        const bodyText = `Rival: ${url}\nFetched: ${out.fetched_at}\n\n${diff}\n\nFull new content and diff are in the rival_snapshots table.`;
        try {
          await emailSvc.sendEmail({
            to: 'info@getsafetea.app',
            subject: subject,
            text: bodyText,
            html: `<pre style="font-family:monospace;font-size:13px;white-space:pre-wrap;">${String(bodyText).replace(/</g, '&lt;')}</pre>`,
          });
          out.email_sent = true;
        } catch (e) {
          out.email_error = e && e.message;
        }
      }
    } catch (err) {
      out.error = err && err.message;
    }
    results.push(out);
  }

  return res.status(200).json({ ok: true, results });
};
