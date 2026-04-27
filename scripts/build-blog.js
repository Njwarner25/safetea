#!/usr/bin/env node
/**
 * Blog auto-publisher.
 *
 * Reads every Markdown file in docs/blog/ and emits:
 *   - public/blog/<slug>.html — a full SEO-friendly static page per article
 *   - public/blog/index.json   — a manifest the blog index page can fetch
 *
 * Wired into the Vercel build via the `vercel-build` npm script. Drop a new
 * .md file into docs/blog/, push to main, the article appears at
 * https://safetea.app/blog/<slug>.html with proper meta tags, JSON-LD, and
 * Open Graph cards. No CMS, no DB writes.
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

const ROOT = path.resolve(__dirname, '..');
const SRC_DIR = path.join(ROOT, 'docs', 'blog');
const OUT_DIR = path.join(ROOT, 'public', 'blog');
const SITE_URL = 'https://safetea.app';
const DEFAULT_HERO = 'https://safetea.app/icon-512.png';

function escape(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDate(d) {
  if (!d) return '';
  const date = new Date(d);
  if (isNaN(date)) return String(d);
  return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function readMinutes(content) {
  const words = content.trim().split(/\s+/).length;
  return Math.max(1, Math.round(words / 220));
}

function renderArticlePage({ slug, title, description, date, author, category, tags, body, readMin, hero }) {
  const url = SITE_URL + '/blog/' + slug;
  const isoDate = date ? new Date(date).toISOString() : '';
  const tagList = (tags || []).map(escape).join(', ');
  const ogImage = hero || DEFAULT_HERO;

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    description: description,
    datePublished: isoDate || undefined,
    author: { '@type': 'Organization', name: author || 'SafeTea Team' },
    publisher: {
      '@type': 'Organization',
      name: 'SafeTea',
      logo: { '@type': 'ImageObject', url: SITE_URL + '/icon-512.png' }
    },
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    image: ogImage
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escape(title)} — SafeTea</title>
  <meta name="description" content="${escape(description || title)}">
  <meta name="author" content="${escape(author || 'SafeTea Team')}">
  ${tagList ? `<meta name="keywords" content="${tagList}">` : ''}
  <link rel="canonical" href="${escape(url)}">

  <meta property="og:type" content="article">
  <meta property="og:title" content="${escape(title)}">
  <meta property="og:description" content="${escape(description || title)}">
  <meta property="og:url" content="${escape(url)}">
  <meta property="og:image" content="${escape(ogImage)}">
  <meta property="og:site_name" content="SafeTea">
  ${isoDate ? `<meta property="article:published_time" content="${isoDate}">` : ''}

  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${escape(title)}">
  <meta name="twitter:description" content="${escape(description || title)}">
  <meta name="twitter:image" content="${escape(ogImage)}">

  <link rel="icon" href="/favicon-32.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700;800&display=swap" rel="stylesheet">

  <script type="application/ld+json">${JSON.stringify(jsonLd)}</script>

  <style>
    *, *::before, *::after { box-sizing: border-box; }
    body { margin: 0; font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; background: #1A1A2E; color: #F0D0C0; line-height: 1.7; }
    a { color: #E8A0B5; }
    .nav { padding: 20px 24px; border-bottom: 1px solid rgba(255,255,255,0.06); }
    .nav-inner { max-width: 720px; margin: 0 auto; display: flex; justify-content: space-between; align-items: center; }
    .brand { font-weight: 800; font-size: 18px; color: #E8A0B5; text-decoration: none; }
    .nav a.back { color: #8080A0; font-size: 13px; text-decoration: none; }
    .nav a.back:hover { color: #E8A0B5; }
    article { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
    .meta { color: #8080A0; font-size: 13px; margin-bottom: 12px; display: flex; gap: 14px; flex-wrap: wrap; }
    .tag { display: inline-block; background: rgba(232,160,181,0.12); color: #E8A0B5; padding: 3px 10px; border-radius: 12px; font-size: 11px; font-weight: 700; letter-spacing: 0.5px; text-transform: uppercase; margin-bottom: 18px; }
    h1 { font-size: 32px; line-height: 1.25; color: #fff; margin: 0 0 24px; font-weight: 800; }
    h2 { font-size: 22px; color: #fff; margin: 36px 0 14px; font-weight: 700; }
    h3 { font-size: 18px; color: #fff; margin: 28px 0 10px; font-weight: 600; }
    p { margin: 0 0 18px; color: #DDD0C8; }
    ul, ol { padding-left: 22px; margin: 0 0 18px; }
    li { margin-bottom: 6px; color: #DDD0C8; }
    blockquote { border-left: 3px solid #E8A0B5; padding: 4px 16px; margin: 18px 0; color: #C4B0A8; font-style: italic; background: rgba(232,160,181,0.04); border-radius: 0 8px 8px 0; }
    code { background: rgba(255,255,255,0.06); padding: 2px 6px; border-radius: 4px; font-size: 0.92em; }
    pre { background: rgba(0,0,0,0.3); padding: 14px; border-radius: 8px; overflow-x: auto; }
    pre code { background: transparent; padding: 0; }
    hr { border: none; border-top: 1px solid rgba(255,255,255,0.08); margin: 32px 0; }
    .footer-cta { margin-top: 48px; padding: 24px; background: rgba(232,160,181,0.06); border: 1px solid rgba(232,160,181,0.15); border-radius: 12px; text-align: center; }
    .footer-cta a { display: inline-block; margin-top: 12px; background: linear-gradient(135deg,#E8A0B5,#D4768E); color: #fff; padding: 12px 28px; border-radius: 10px; text-decoration: none; font-weight: 600; }
    footer.site-footer { text-align: center; padding: 32px 24px; color: #555; font-size: 12px; border-top: 1px solid rgba(255,255,255,0.06); }
    @media (max-width: 600px) { h1 { font-size: 26px; } article { padding: 32px 18px; } }
  </style>
</head>
<body>
  <nav class="nav">
    <div class="nav-inner">
      <a class="brand" href="/">SafeTea</a>
      <a class="back" href="/blog.html">&larr; All articles</a>
    </div>
  </nav>

  <article>
    ${category ? `<div class="tag">${escape(category)}</div>` : ''}
    <h1>${escape(title)}</h1>
    <div class="meta">
      ${author ? `<span>${escape(author)}</span>` : ''}
      ${date ? `<span>${escape(formatDate(date))}</span>` : ''}
      <span>${readMin} min read</span>
    </div>
    ${body}
    <div class="footer-cta">
      <strong style="color:#fff;font-size:16px;">Stay connected, stay safe.</strong>
      <p style="color:#8080A0;font-size:13px;margin:8px 0 0;">Open SafeTea in your browser — no app required.</p>
      <a href="/dashboard.html">Open SafeTea</a>
    </div>
  </article>

  <footer class="site-footer">
    &copy; ${new Date().getFullYear()} SafeTea. Stay connected, stay safe.
  </footer>
</body>
</html>
`;
}

function build() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('[BuildBlog] No source directory at', SRC_DIR);
    return;
  }

  if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

  marked.setOptions({ gfm: true, breaks: false });

  const files = fs.readdirSync(SRC_DIR).filter(function (f) { return f.toLowerCase().endsWith('.md'); });
  const manifest = [];
  let written = 0;

  for (const file of files) {
    const fullPath = path.join(SRC_DIR, file);
    const raw = fs.readFileSync(fullPath, 'utf8');
    let parsed;
    try {
      parsed = matter(raw);
    } catch (err) {
      console.warn('[BuildBlog] Skipping', file, '— frontmatter parse failed:', err.message);
      continue;
    }
    const data = parsed.data || {};
    const content = parsed.content || '';
    const slug = data.slug || file.replace(/\.md$/i, '');
    if (!data.title) {
      console.warn('[BuildBlog] Skipping', file, '— missing title in frontmatter');
      continue;
    }

    const body = marked.parse(content);
    const readMin = readMinutes(content);

    const html = renderArticlePage({
      slug,
      title: data.title,
      description: data.description || '',
      date: data.date || null,
      author: data.author || 'SafeTea Team',
      category: data.category || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      body,
      readMin,
      hero: data.hero || data.image || null
    });

    fs.writeFileSync(path.join(OUT_DIR, slug + '.html'), html);
    written++;

    manifest.push({
      slug,
      title: data.title,
      description: data.description || '',
      date: data.date ? new Date(data.date).toISOString() : null,
      author: data.author || 'SafeTea Team',
      category: data.category || '',
      tags: Array.isArray(data.tags) ? data.tags : [],
      readMin,
      url: '/blog/' + slug + '.html'
    });
  }

  manifest.sort(function (a, b) {
    if (!a.date) return 1;
    if (!b.date) return -1;
    return new Date(b.date) - new Date(a.date);
  });

  fs.writeFileSync(path.join(OUT_DIR, 'index.json'), JSON.stringify(manifest, null, 2));

  console.log('[BuildBlog]', written, 'article(s) generated;', manifest.length, 'in manifest.');
}

build();
