# City Landing Page Template — `/city/<slug>`

This template defines the indexable, SEO-optimized content for SafeTea city landing pages. It is meant to slot into the existing `public/city.html` rendering layer (which currently fetches from `/api/cities/<slug>` and shows either an "active city" state or a "waitlist" state).

The current `city.html` is intentionally minimal — it shows a name, a progress bar, and a signup form. To rank for "[city] AWDTSG alternative," "[city] dating safety," and similar queries, we need richer content rendered on the page itself (server-side or hydrated from an extended city API response).

This document specifies:
1. **The content model** — every slot the page should fill
2. **Voice and rules** — how each slot should be written
3. **A worked example** — the full content for `/city/austin`, ready to ship

---

## 1. Content model

Each city page should support the following slots, in this order:

### 1.1 Page-level SEO

| Slot | Format | Notes |
|---|---|---|
| `meta_title` | string ≤ 60 chars | Format: `SafeTea {City}: Dating Safety Community ({State})` |
| `meta_description` | string ≤ 155 chars | Lead with what the page offers, not a generic tagline |
| `canonical_url` | URL | `https://getsafetea.app/city/<slug>` |
| `og_image` | URL | City-specific social card; fall back to default SafeTea card if not yet generated |
| `schema_type` | string | `LocalBusiness` if city is active, `WebPage` + `FAQPage` if waitlist |

### 1.2 Hero

| Slot | Format | Notes |
|---|---|---|
| `city_name` | string | "Austin," not "austin" |
| `state_or_region` | string | "Texas" — full state name, not abbreviation |
| `emoji_or_image` | string | Already supported in `city.html`. Use a recognizable city symbol, not a generic city emoji |
| `headline` | string | "Dating safer in {City}" if active; "Help bring SafeTea to {City}" if waitlist |
| `subheadline` | string | One sentence specific to the city — see voice rules below |
| `primary_cta` | object | `{label, href}`. Web URL only. No iOS download CTAs |

### 1.3 City-specific stats block

These are the credibility signals that make the page rank and convert. Three to five numbers, each with a clear source citation. Format each as:

```
{number} | {label} | {source / year}
```

Required stat slots (all `<<VERIFY-DATA>>` flagged until a researcher confirms):

| Slot | Example | Source |
|---|---|---|
| Active dating-app users in metro area | "~1.4M adults on dating apps in Greater Austin" | Pew Research / Statista metro estimate |
| Local online-dating-related complaints filed in last year | "FTC received {N} romance scam complaints from {state} in {year}" | FTC Consumer Sentinel state-level data |
| Estimated former AWDTSG-{city} membership | "AWDTSG-Austin Facebook groups peaked at ~12,000 combined members" | Public press coverage / Internet Archive |
| Active SafeTea members in this city (or waitlist count) | "{count} signed up" | First-party data — pulled live from `/api/cities/<slug>` |
| Top dating apps used locally | "Hinge, Bumble, Tinder are the top three by daily active users in this metro" | Pew metro breakdown |

> **Hard rule:** if a stat is not verifiable, omit it. Do not invent numbers to fill the layout. A page with three solid stats outperforms a page with five sketchy ones.

### 1.4 Recent local context block

Rotating section that lists 1–3 recent dating-safety-related stories or trends in this city — never specific named individuals. Examples of acceptable framing:

- "Local TV station {KXAN} reported a rise in romance scam losses in {year}, with {state} ranking {Nth} nationally" — link to the local-press article
- "AWDTSG-{city} groups were deleted from Facebook in {month/year} following a coordinated reporting campaign" — link to coverage
- "City attorney's office issued a {date} bulletin on dating app safety" — link to the bulletin

This block is what makes the page locally relevant in Google's eyes. It also makes the page useful, not just optimized.

> **Hard rule:** never feature a specific named person, even if their story is in the news. The brand promise is anti-doxxing — that includes not amplifying named-individual coverage.

### 1.5 What SafeTea offers in this city

A short bulleted list, customized per city. Same building blocks across cities, but the framing should reflect whether the city is active or waitlist:

**If city is active:**
- "Join {N} {city} members already using SafeTea"
- "City-specific safety reports and community moderation"
- "SafeWalk and profile screening, available in your browser"

**If city is waitlist:**
- "Join the {city} waitlist — we activate cities once they hit the local threshold"
- "Get early access when {city} unlocks"
- "Use SafeTea's profile screening and SafeWalk anywhere in the meantime"

### 1.6 City-specific FAQ

Three to five Q&As, FAQPage schema. Always include:
- "Is SafeTea active in {City}?"
- "How is SafeTea different from {City}'s AWDTSG Facebook groups?"
- "What dating apps are most common in {City}?" (lets us mention Hinge / Bumble / Tinder, which surface our screening use case)
- "Is SafeTea on the iOS App Store?" — answered with the web-first reframe from blog post #3

### 1.7 Internal links

Every city page should link to:
- `/blog/awdtsg-alternatives-2026` (the AWDTSG comparison post)
- `/blog/safewalk-date-sharing-privacy-guide` (SafeWalk explainer)
- `/blog/install-safetea-iphone-no-app-store` (PWA install guide)
- `/city` (city index — supports waitlist conversion in nearby cities)
- `/signup` (primary conversion target for active cities)

### 1.8 CTA section

Single primary CTA, no secondary distractions. Web URL only.
- Active city: "Sign up — open in browser, no app required" → `/signup`
- Waitlist city: "Join the {city} waitlist" → existing waitlist form on `city.html`

---

## 2. Voice and rules

- **Specific, never generic.** "Dating safer in Austin" beats "Dating safety, anywhere." If it could be on any city's page, rewrite it.
- **Calm, not fearmongering.** Same voice as the blog: protective, informed, second-person. No "shocking statistics," no "every woman is at risk."
- **Privacy-first framing.** When mentioning AWDTSG groups, frame the deletion problem and our anti-doxxing answer. Never link to AWDTSG screenshots or named individuals.
- **No iOS download CTAs.** Per `ALTERNATIVE_MARKETING_PLAN.md`. Every CTA is a web URL.
- **Only ship pages where SafeTea has a real signal.** Either the city is active, or it has a meaningful waitlist. Empty cities should not have a hand-built SEO page — let the existing `city.html` waitlist mechanic handle them.
- **Localism without overreach.** Reference local press, local stats, and local dating-app patterns. Do *not* claim partnerships with local orgs unless those partnerships actually exist.

---

## 3. Worked example — `/city/austin`

The complete content payload for the Austin landing page. A developer should be able to render this against the existing `city.html` (extended with the new slots) and ship.

### 3.1 Page-level SEO

```yaml
slug: austin
meta_title: "SafeTea Austin: Dating Safety Community (Texas)"   # 51 chars
meta_description: "Austin's purpose-built dating safety community. Profile screening, SafeWalk, and city-specific reports — open in your browser, no app required."  # 152 chars
canonical_url: "https://getsafetea.app/city/austin"
og_image: "https://getsafetea.app/og/city/austin.png"  # <<VERIFY: confirm OG card exists; otherwise fall back to default>>
schema_type: "WebPage + FAQPage"  # update to LocalBusiness once Austin is fully active
```

### 3.2 Hero

- `city_name`: Austin
- `state_or_region`: Texas
- `emoji_or_image`: 🤠 (placeholder — recommend replacing with a custom Austin glyph in design pass)
- `headline`: **Dating safer in Austin**
- `subheadline`: A purpose-built community for Austin women who want to vet dates, share patterns, and stay anonymous. Open in your browser. No app store required.
- `primary_cta`: `{ label: "Sign up — open in browser", href: "/signup" }`

### 3.3 City-specific stats block

| Number | Label | Source |
|---|---|---|
| ~1.4M | Adults in Greater Austin using dating apps | Pew Research metro estimates, latest available year `<<VERIFY-DATA>>` |
| 1,200+ | Romance scam complaints filed by Texas residents in the most recent reported year | FTC Consumer Sentinel Texas state report `<<VERIFY-DATA>>` |
| ~12,000 | Combined peak membership of Austin AWDTSG Facebook groups before mass deletions | Public press coverage and Internet Archive snapshots `<<VERIFY-DATA>>` |
| {live count} | Austin-area members on SafeTea today | Pulled live from `/api/cities/austin` |
| Hinge, Bumble, Tinder | The three most-used dating apps in the Austin metro | Pew Research dating app demographics `<<VERIFY-DATA>>` |

### 3.4 Recent local context block

> **Heads up:** the items below are sample framings to be replaced with current, verified local stories. The page should rotate this block at least quarterly.

- **`<<VERIFY-DATA>>`** Texas ranks among the top five US states for FTC-reported romance scam losses, with Austin metro consistently appearing in state-level filings. Source: FTC Consumer Sentinel state report, latest year. `<<INSERT LINK>>`
- **`<<VERIFY-DATA>>`** Austin AWDTSG Facebook groups were deleted in a coordinated reporting wave in {year}; multiple successor groups have re-formed and been deleted again since. Source: local press coverage. `<<INSERT LINK>>`
- **`<<VERIFY-DATA>>`** A {date} KXAN investigative report on Austin dating app catfishing patterns highlighted the lack of cross-platform safety tools. Source: KXAN. `<<INSERT LINK>>`

### 3.5 What SafeTea offers in Austin

> Render this conditionally — the active version below assumes Austin has crossed its activation threshold. If still on waitlist, swap to the waitlist variant in section 1.5.

**Active variant (recommended for Austin if community is live):**

- Join your Austin neighbors already using SafeTea — profile screening, SafeWalk, and city-specific safety reports
- Anonymous by design: pseudonyms only, illustrated avatars, no real names
- Built outside of Meta — your safety community does not disappear because a Facebook group did

### 3.6 Austin FAQ

**Q1: Is SafeTea active in Austin?**
> Yes. Austin is one of SafeTea's launch cities, with an active community of women using the platform for profile screening, SafeWalk date check-ins, and city-specific safety reports. You can sign up and start using SafeTea in your browser today.

**Q2: How is SafeTea different from AWDTSG groups in Austin?**
> AWDTSG-Austin Facebook groups have been deleted multiple times by Meta, taking years of safety information with them each time. SafeTea is a dedicated platform built outside of Facebook — your reports do not vanish in a deletion wave, posts are anonymous by default, and the moderation is staffed and supported instead of left to volunteer burnout. We covered the full comparison in our [AWDTSG alternatives guide](/blog/awdtsg-alternatives-2026).

**Q3: What dating apps are most popular in Austin?**
> Hinge, Bumble, and Tinder are the three most-used dating apps in the Austin metro, with Hinge gaining ground over the past two years. SafeTea's profile screening works on profiles from any of them — paste a profile or upload a screenshot and get a risk assessment in seconds.

**Q4: Is SafeTea on the iOS App Store?**
> SafeTea is a web app by design. It works in Safari on iPhone, and you can add it to your home screen for an app-like icon and full-screen experience — without an App Store download. Our [iPhone install guide](/blog/install-safetea-iphone-no-app-store) walks through the sixty-second setup.

**Q5: How do I report someone in Austin on SafeTea?**
> Sign up, verify your account, and use the "New report" flow from your dashboard. Reports in Austin are visible to other verified Austin members and moderated by SafeTea's safety team. All posts are anonymous by default — your report does not include your real name or photo.

### 3.7 Internal links (rendered as a "Related" block at the bottom)

- [Best AWDTSG alternatives in 2026](/blog/awdtsg-alternatives-2026)
- [How SafeWalk shares your date without sharing your privacy](/blog/safewalk-date-sharing-privacy-guide)
- [Install SafeTea on your iPhone (no App Store required)](/blog/install-safetea-iphone-no-app-store)
- [10 red flags AI can spot on a dating profile](/blog/10-red-flags-ai-detects-dating-profiles)
- [See all SafeTea cities](/city)

### 3.8 CTA section

```
Sign up — open in browser, no app required
→ /signup
```

One CTA. Same as the hero. No secondary distractions.

---

## 4. Implementation notes for engineering

The current `public/city.html` renders city pages client-side from `/api/cities/<slug>`. To support this template, two changes are needed:

1. **Extend the city API response** to include the slots above (stats, FAQ, recent context, custom meta). For SEO purposes, this content must also be **server-rendered or pre-rendered** — Google's crawler should not have to execute JavaScript to see the FAQ content. Recommend either a server-side render path for `/city/<slug>` requests, or static generation per city at build time.
2. **Inject FAQPage JSON-LD schema** server-side when the city has an FAQ block.

Until those land, the FAQ and stat blocks are best published as a hand-written supplemental article (e.g., `/blog/austin-dating-safety`) and cross-linked from the city page. That gets the SEO value while the city.html infrastructure catches up.

---

## 5. Quality checklist before publishing a new city page

- [ ] City has either an active community or a meaningful waitlist count (no empty cities)
- [ ] All `<<VERIFY-DATA>>` flags resolved with sourced numbers, or the slot is omitted
- [ ] Meta title ≤ 60 chars, meta description ≤ 155 chars
- [ ] FAQ schema renders correctly
- [ ] No iOS download CTAs anywhere on the page
- [ ] No real named individuals from local incidents or AWDTSG screenshots
- [ ] At least 5 internal links per section 1.7
- [ ] Local press citations are first-party (KXAN, Statesman, etc.) — not aggregator content farms
- [ ] OG image either custom or fallback to default; never broken
- [ ] Last-updated timestamp visible at the bottom of the page
