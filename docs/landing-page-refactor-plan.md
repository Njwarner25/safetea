# SafeTea Landing Page — Full Refactor Plan

**Date:** 2026-03-22
**Current state:** Post-dedup restructure (907 HTML, 2042 CSS, 326 JS lines)
**Goal:** Clean, fast, maintainable landing page with React-ready component structure

---

## Audit Summary

| Metric | Current | Target |
|--------|---------|--------|
| index.html | 907 lines | ~550 lines |
| style.css | 2,042 lines (31% dead) | ~1,200 lines |
| script.js | 326 lines (34 dead) | ~280 lines |
| Sections | 11 + legal + footer | 8 + legal + footer |
| Inline styles | 12 instances | 0 |
| Responsive breakpoints | 3 (scattered across 11 blocks) | 4 (consolidated) |
| SVG logo duplicates | 4 copies | 1 reusable `<symbol>` |

---

## Phase 1: Dead Code Removal (~30 min)

### 1A. Remove orphaned CSS (saves ~628 lines)

Delete these CSS blocks entirely — they style sections that no longer exist in the HTML:

| Block | Lines | Reason |
|-------|-------|--------|
| Problem Section | 165–180 | Section merged into hero |
| Community Alerts | 1151–1333 | Section removed |
| Community Hub | 1417–1539 | Section removed |
| App Download Teaser | 1599–1737 (keep `.store-badge` rules only) | Section merged into CTA |
| Orphaned light-mode refs | 1012–1018 (`.blog-card`, `.tea-post`, `.refer-card`, `.catfish-stat`, `.hub-tab`, `.alerts-feed-card`, `.crime-pattern-card`) | Reference deleted elements |
| `.guidelines-section` padding | Line 264 | Container class is unused; guidelines embedded in safety section |

### 1B. Remove dead JS (saves ~34 lines)

Delete the typing animation block (script.js lines 147–180) — it targets `.typing-text` which does not exist in the HTML.

### 1C. Remove duplicate CSS rules

| Rule | First definition | Duplicate | Action |
|------|-----------------|-----------|--------|
| `.hero-badge` | Line 107 | Line 907 | Keep 907 (the shimmer version), delete 107 |
| `.navbar` backdrop-filter | Line 78 | Line 969 | Keep 78, delete 969 |
| `.guideline-card li` | Line 276 | Line 951 | Keep 276, delete 951 |
| `.footer-links a` transition | Line 346 | Line 860 | Keep 860 (more complete), delete 346 |
| `.footer-links a:hover` | Line 348 | Line 855 | Keep 855, delete 348 |

---

## Phase 2: Consolidate CSS Architecture (~45 min)

### 2A. Merge scattered `@media` blocks into 4 consolidated breakpoints

Current: 11 separate `@media` blocks scattered throughout the file.
Target: 4 blocks, placed at the end of the stylesheet.

```css
/* === RESPONSIVE: Large Desktop (1200px+) === */
@media (min-width: 1200px) { ... }

/* === RESPONSIVE: Tablet (max-width: 1024px) === */
@media (max-width: 1024px) { ... }

/* === RESPONSIVE: Mobile (max-width: 768px) === */
@media (max-width: 768px) { ... }

/* === RESPONSIVE: Small Mobile (max-width: 480px) === */
@media (max-width: 480px) { ... }
```

Add `1024px` breakpoint for tablet landscape (currently missing).

### 2B. Extract inline styles to CSS classes

```css
/* Logo text colors */
.logo-text-safe { color: #4CAF50; }
.logo-text-tea { color: #F27059; }

/* Hero problem context */
.hero-problem-context {
  color: var(--gray);
  font-size: 0.95rem;
  margin-top: 8px;
  margin-bottom: 16px;
}

/* Avatar color modifiers */
.post-avatar--primary { background: var(--primary); }
.post-avatar--purple { background: #8B5CF6; }
.testimonial-avatar--primary { background: var(--primary); }
.testimonial-avatar--purple { background: #8B5CF6; }
.testimonial-avatar--green { background: #10B981; }

/* Guidelines embedded layout */
.guidelines-embedded { margin-top: 60px; }
.guidelines-inner-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}
@media (max-width: 768px) {
  .guidelines-inner-grid { grid-template-columns: 1fr; }
}

/* CTA store badges override */
.cta-store-badges {
  margin-top: 32px;
  display: flex;
  gap: 16px;
  justify-content: center;
}
```

### 2C. Standardize color palette

Current inconsistency:
- `index.html` CSS uses `--primary: #E8513F`
- `blog.html`/`dashboard.html` use `#F27059`
- New logo uses `#4CAF50` (green) and `#F27059` (coral)

Standardize to:

```css
:root {
  --green: #4CAF50;
  --green-dark: #388E3C;
  --coral: #F27059;
  --coral-dark: #E85D44;
  --primary: #F27059;       /* Update from #E8513F */
  --primary-dark: #E85D44;  /* Update from #C4402F */
  --primary-light: #FFAB9A; /* Update from #FF8A7A */
  --gradient: linear-gradient(135deg, #4CAF50 0%, #F5A87A 50%, #F27059 100%);
  --gradient-text: linear-gradient(135deg, #4CAF50, #F5A87A, #F27059);
}
```

---

## Phase 3: Reduce Vertical Padding (~15 min)

### Current: `100px 0` on all major sections = ~200px whitespace between sections

### Proposed tiered padding system:

```css
/* Hero stays tall */
.hero { padding: 160px 0 80px; }         /* was 160px 0 100px — tighter bottom */

/* Major content sections — reduced */
.features-section,
.safety-tools,
.how-section,
.testimonials-section,
.safety-section,
.pricing-section { padding: 80px 0; }    /* was 100px 0 */

/* Interactive/engagement sections — tighter */
.city-voting-section,
.faq-section { padding: 64px 0; }        /* was 100px 0 */

/* CTA — intentionally spacious */
.cta-section { padding: 80px 0; }        /* was 100px 0 */

/* Section headers — reduce bottom margin */
.section-header { margin-bottom: 48px; }  /* was 60px */
```

**Estimated scroll reduction: ~400–500px total page length.**

---

## Phase 4: Section Restructuring (~1 hour)

### 4A. Safety Tools — Convert to tabbed/accordion interface

**Problem:** 158 lines, two massive cards with fake UI elements.
**Solution:** Show one tool at a time with tab toggle.

```html
<section class="safety-tools" id="safety-tools">
  <div class="container">
    <div class="section-header">...</div>

    <div class="tools-tabs">
      <button class="tools-tab active" data-tool="registry">
        <i class="fas fa-map-marker-alt"></i> Sex Offender Locator
      </button>
      <button class="tools-tab" data-tool="background">
        <i class="fas fa-user-shield"></i> Background Check
      </button>
    </div>

    <div class="tool-panel active" id="tool-registry">
      <!-- Single card content -->
    </div>
    <div class="tool-panel" id="tool-background">
      <!-- Single card content -->
    </div>

    <div class="tools-disclaimer">...</div>
    <details class="fcra-details">
      <summary>FCRA Compliance Notice</summary>
      <!-- Full FCRA text - collapsed by default -->
    </details>
  </div>
</section>
```

**Wins:** Halves visible height, FCRA notice collapsed by default (16 lines hidden until clicked).

### 4B. City Voting — JS-driven leaderboard

**Problem:** 139 lines, 8 near-identical leaderboard items (80 lines of repetitive HTML).
**Solution:** Render leaderboard from a JS data array.

```html
<div class="leaderboard-list" id="cityLeaderboard"></div>
```

```js
const cities = [
  { name: 'Phoenix, AZ', votes: 187 },
  { name: 'Nashville, TN', votes: 156 },
  { name: 'Portland, OR', votes: 134 },
  { name: 'Charlotte, NC', votes: 112 },
  { name: 'San Diego, CA', votes: 98 },
  { name: 'Minneapolis, MN', votes: 76 },
  { name: 'Philadelphia, PA', votes: 61 },
  { name: 'Las Vegas, NV', votes: 43 },
];

function renderLeaderboard() {
  const el = document.getElementById('cityLeaderboard');
  el.innerHTML = cities.map((city, i) => {
    const pct = (city.votes / 200 * 100).toFixed(1);
    const isHot = city.votes >= 180;
    return `
      <div class="leaderboard-item" data-city="${city.name}" data-votes="${city.votes}">
        <div class="leaderboard-rank ${isHot ? 'hot' : ''}">${i + 1}</div>
        <div class="leaderboard-info">
          <div class="leaderboard-city">${city.name}${isHot ? ' <span class="almost-badge"><i class="fas fa-fire"></i> Almost there!</span>' : ''}</div>
          <div class="leaderboard-bar"><div class="leaderboard-fill" style="width:${pct}%"></div></div>
        </div>
        <div class="leaderboard-votes"><span class="vote-count">${city.votes}</span>/200</div>
        <button class="btn-vote" data-city="${city.name}"><i class="fas fa-arrow-up"></i></button>
      </div>`;
  }).join('');
}
```

**Saves ~70 lines of HTML.**

### 4C. FAQ — Move from 7 items to 5 most-asked

Remove or merge:
- "How is SafeTea different from Facebook groups?" → Already answered by hero + features. Remove.
- "Is the sex offender and background check data accurate?" → Move answer text into Safety Tools disclaimer. Remove FAQ item.

Keep 5: identity hidden, verification process, false information, men can see, SafeTea+ pricing.

### 4D. Merge FAQ + CTA into single final section

Instead of separate FAQ and CTA sections, combine into one "Get Started" finale:

```
┌──────────────────────────────────────────┐
│  Got Questions?        Ready to Join?    │
│  ┌──────────────┐    ┌───────────────┐   │
│  │ FAQ Accordion │    │ Email signup  │   │
│  │ 5 items       │    │ City select   │   │
│  │               │    │ [Get Access]  │   │
│  │               │    │               │   │
│  │               │    │ App badges    │   │
│  └──────────────┘    └───────────────┘   │
└──────────────────────────────────────────┘
```

**Saves one full section worth of padding (~200px vertical space).**

### 4E. SVG Logo — Use `<symbol>` + `<use>` pattern

Replace 4 inline SVG copies with one shared symbol definition:

```html
<!-- At top of <body> -->
<svg style="display:none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="logoGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#4CAF50"/>
      <stop offset="50%" stop-color="#F5A87A"/>
      <stop offset="100%" stop-color="#F27059"/>
    </linearGradient>
  </defs>
  <symbol id="safetea-logo" viewBox="0 0 64 64">
    <path d="M12 22 C12 22 10 44 16 50 C20 54 36 54 40 50 C46 44 44 22 44 22 Z" fill="url(#logoGrad)" opacity="0.9"/>
    <path d="M44 28 C50 28 54 32 54 38 C54 44 50 46 44 46" stroke="url(#logoGrad)" stroke-width="4" fill="none" stroke-linecap="round"/>
    <ellipse cx="28" cy="54" rx="20" ry="4" fill="url(#logoGrad)" opacity="0.5"/>
    <path d="M20 36 L26 42 L38 28" stroke="white" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
    <path d="M22 16 C22 12 26 12 26 16" stroke="url(#logoGrad)" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.6"/>
    <path d="M30 14 C30 10 34 10 34 14" stroke="url(#logoGrad)" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.4"/>
  </symbol>
</svg>

<!-- Then use everywhere as: -->
<svg class="logo-icon" width="32" height="32"><use href="#safetea-logo"/></svg>
```

---

## Phase 5: React Component Architecture (for future migration)

### Proposed component tree:

```
App
├── Navbar
│   ├── Logo (shared SVG component)
│   ├── NavLinks
│   ├── ThemeToggle
│   └── HamburgerMenu (mobile)
│
├── HeroSection
│   ├── HeroBadge
│   ├── HeroContent (headline, subtitle, problem context)
│   ├── HeroCTA (buttons)
│   ├── HeroStats (3 counters)
│   └── PhoneMockup
│       └── AppPost[] (map over data array)
│
├── PressBar
│
├── FeaturesSection
│   └── FeatureCard[] (map over 6-item data array)
│
├── SafetyToolsSection
│   ├── ToolTabs
│   ├── ToolPanel (Registry) / ToolPanel (Background)
│   ├── ToolDisclaimer
│   └── FCRANotice (collapsible)
│
├── HowItWorksSection
│   └── StepCard[] (map over 3 steps)
│
├── TestimonialsSection
│   ├── TestimonialCard[] (map over 4 items)
│   └── StatsBar
│
├── TrustAndSafetySection
│   ├── PrivacyPromise (bullet list)
│   ├── ShieldGraphic
│   └── CommunityGuidelines (green/red cards)
│
├── PricingSection (Stripe embed)
│
├── GetStartedSection (merged FAQ + CTA)
│   ├── FAQAccordion
│   │   └── FAQItem[] (map over 5 items)
│   ├── SignupForm
│   └── AppStoreBadges
│
├── CityVotingSection
│   ├── VoteForm
│   ├── VotingExplainer
│   └── Leaderboard
│       └── LeaderboardItem[] (map over data array)
│
├── LegalDisclaimer
│
└── Footer
    ├── Logo
    ├── FooterLinks (3 columns)
    ├── SocialLinks
    └── Copyright
```

### Data files (extract from markup):

```
src/
├── components/
│   ├── Navbar.tsx
│   ├── HeroSection.tsx
│   ├── PressBar.tsx
│   ├── FeaturesSection.tsx
│   ├── SafetyToolsSection.tsx
│   ├── HowItWorksSection.tsx
│   ├── TestimonialsSection.tsx
│   ├── TrustAndSafetySection.tsx
│   ├── PricingSection.tsx
│   ├── GetStartedSection.tsx
│   ├── CityVotingSection.tsx
│   ├── LegalDisclaimer.tsx
│   ├── Footer.tsx
│   └── shared/
│       ├── Logo.tsx           ← single SVG component
│       ├── SectionHeader.tsx  ← reusable section header
│       └── GradientText.tsx   ← reusable gradient span
│
├── data/
│   ├── features.ts        ← 6 feature objects
│   ├── testimonials.ts    ← 4 testimonial objects
│   ├── faqItems.ts        ← 5 FAQ Q&A pairs
│   ├── cities.ts          ← 8 city voting objects
│   ├── steps.ts           ← 3 how-it-works steps
│   └── pressLogos.ts      ← 6 press outlet names
│
└── styles/
    ├── globals.css         ← variables, reset, base
    ├── components/         ← per-component CSS modules
    └── responsive.css      ← consolidated breakpoints
```

---

## Phase 6: Performance & Lazy-Loading

### Lazy-load below the fold:

| Component | Strategy |
|-----------|----------|
| SafetyToolsSection | `loading="lazy"` / Intersection Observer — heavy UI |
| TestimonialsSection | Lazy — not critical path |
| CityVotingSection | Lazy — interactive, not needed at load |
| PricingSection | Lazy — Stripe JS is 100KB+ external script |
| GetStartedSection (FAQ+CTA) | Lazy — bottom of page |

### Load immediately (above the fold):
- Navbar
- HeroSection
- PressBar
- FeaturesSection

### Move to separate pages:
| Content | Current location | Recommendation |
|---------|-----------------|----------------|
| Full FCRA notice | Inline in Safety Tools | Move to `/legal/fcra` page, keep 1-line summary + link |
| Community guidelines detail | Embedded in Trust section | Move to `/community-guidelines` page, keep summary cards |
| Blog / Community Hub | Already removed from landing | Keep on `/blog.html` (already done) |
| Full city leaderboard | Inline voting section | Show top 5 on landing, "See all cities →" link to `/cities` page |

### Stripe pricing table:
```html
<!-- Defer Stripe JS load until section is visible -->
<section class="pricing-section" id="pricing" data-lazy-stripe>
  <div class="container">
    <div class="section-header">...</div>
    <div class="stripe-placeholder">Loading pricing...</div>
  </div>
</section>

<script>
const pricingObserver = new IntersectionObserver((entries) => {
  if (entries[0].isIntersecting) {
    const script = document.createElement('script');
    script.src = 'https://js.stripe.com/v3/pricing-table.js';
    script.async = true;
    script.onload = () => {
      document.querySelector('.stripe-placeholder').outerHTML = `
        <stripe-pricing-table pricing-table-id="prctbl_1TDXNtFaKA9n89CXUmNCErMw"
          publishable-key="pk_live_...">
        </stripe-pricing-table>`;
    };
    document.head.appendChild(script);
    pricingObserver.disconnect();
  }
}, { rootMargin: '200px' });
pricingObserver.observe(document.querySelector('[data-lazy-stripe]'));
</script>
```

### Font optimization:
- **Playfair Display** is loaded at 700/800/900 weights but only visibly used for `.press-logo` and `.tstat-number`. Consider removing it entirely and using Inter 800/900 instead, saving ~60KB of font downloads.

---

## Phase 7: Final Page Flow

### Target section order (8 sections + legal + footer):

```
1. Hero (with problem context, phone mockup, stats)
2. Press Bar
3. Features (6 cards, 3×2 grid)
4. Safety Tools (tabbed: Registry | Background Check, FCRA collapsed)
5. How It Works (3 steps)
6. Testimonials (4 cards + stats bar)
7. Trust & Safety (privacy promise + guidelines cards)
8. Pricing (lazy-loaded Stripe)
9. Get Started (FAQ accordion left + signup form right, merged)
10. City Voting (top 5 cities, JS-rendered, "see all" link)
11. Legal Disclaimer
12. Footer
```

### Estimated total reduction:
- **~35% less HTML** (907 → ~580 lines)
- **~40% less CSS** (2042 → ~1200 lines)
- **~15% less JS** (326 → ~280 lines, but more functional)
- **~500px less scroll height** (from padding reduction + section merging)
- **~160KB less initial page weight** (deferred Stripe JS + dropped Playfair font)

---

## Implementation Order

| Step | Phase | Priority | Effort |
|------|-------|----------|--------|
| 1 | Dead CSS removal | P0 | 15 min |
| 2 | Dead JS removal | P0 | 5 min |
| 3 | SVG `<symbol>` consolidation | P1 | 15 min |
| 4 | Inline styles → CSS classes | P1 | 20 min |
| 5 | Color palette standardization | P1 | 15 min |
| 6 | Padding reduction | P1 | 10 min |
| 7 | CSS `@media` consolidation | P1 | 30 min |
| 8 | Safety Tools → tabbed UI | P2 | 30 min |
| 9 | City Voting → JS-rendered | P2 | 20 min |
| 10 | FAQ + CTA merge | P2 | 30 min |
| 11 | FCRA → `<details>` collapse | P2 | 10 min |
| 12 | Stripe lazy-load | P2 | 15 min |
| 13 | Leaderboard → top 5 only | P3 | 10 min |
| 14 | Drop Playfair font | P3 | 5 min |
| 15 | React migration (if decided) | P3 | Multi-day |
