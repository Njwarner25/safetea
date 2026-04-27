# SafeTea Landing Page Rewrite — Web-First / PWA / Android

**Purpose:** Drop-in replacement for `public/index.html` hero, CTAs, and key supporting blocks. Removes App Store download CTAs (iOS approval pending) and reframes SafeTea as a browser-native, privacy-first dating safety community. Android via Google Play is acceptable to feature; iOS routes to PWA "Add to Home Screen" or to a soft waitlist.

**Brand voice:** Smart, protective, calm. Not fearmongering. Treat users as adults.
**Anchor tagline (used sparingly):** *Date smarter. Stay safer.*

---

## 1. Hero — Headline & Sub-Hero Variants

### Headline variants

**Variant A (RECOMMENDED) — clarity + speed**
> **Dating safety, the moment you need it. Right in your browser.**

**Variant B — community frame**
> **The dating safety community that doesn't live on Facebook.**

**Variant C — empowerment frame**
> **Date smarter. Stay safer. No download required.**

**Pick:** Variant A. It leads with the user's job-to-be-done ("dating safety"), removes the friction objection ("right in your browser") in the same line, and works for cold traffic that has never heard of AWDTSG. Variants B and C assume more category awareness; we'll move to one of them once we have brand recognition.

*Rationale: cold visitors decide in 3 seconds whether to scroll. The headline has to answer "what is this and why should I stay" before it can be clever.*

### Sub-hero variants

**Variant A (RECOMMENDED, pairs with Headline A)**
> A women-led community for sharing dating red flags, vetting matches, and looking out for each other — built on privacy, not Facebook groups that disappear overnight.

**Variant B**
> Anonymous. Moderated. Built by women, for women. Open SafeTea in any browser and join the safety community in your city.

**Variant C**
> Pseudonyms only. No real names, no screenshots, no Meta. The purpose-built successor to AWDTSG groups — and you can use it right now, no app store needed.

**Pick:** Variant A. It explicitly contrasts SafeTea with the Facebook-group failure mode the AWDTSG audience already feels, and it sets up the "no app required" block below without being heavy-handed.

*Rationale: the warmest cohort (AWDTSG-aware women) has a real, named pain — groups vanishing. Naming that pain in the sub-hero is a stronger conversion lever than re-listing features.*

---

## 2. CTAs

**Primary CTA (button copy)**
> **Start in browser** *(secondary line, smaller, beneath the button: "Free. No download. 30 seconds to join.")*

**Secondary CTA — iPhone users (button or text-link, with Apple glyph)**
> **On iPhone? Add to Home Screen** *(opens a tooltip / modal with two-step Add-to-Home-Screen instructions and a screenshot)*

**Tertiary CTA — Android users (small button with Google Play badge — only show if device-detected as Android, otherwise hide)**
> **Get the Android app** *(only show when Android Play listing is live; until then, route Android visitors to the same web experience)*

*Rationale: "Start in browser" reframes the install step as already done. Putting the iPhone CTA second (not hidden) protects the iOS user without making them feel second-class — they get the same product, one extra tap. Conditional Android CTA prevents iPhone users from seeing a button they can't use.*

---

## 3. "No App Required" Explainer Block

*(Placed directly below hero CTAs, before the stats bar.)*

> **No download. No App Store. No waiting.**
>
> SafeTea runs in any modern browser — Chrome, Safari, Firefox, Edge. On iPhone, tap **Share → Add to Home Screen** and SafeTea behaves like an app, with its own icon, full-screen view, and notifications. On Android, install from Google Play or stay in the browser. Either way, your account, your city, and your safety tools are the same. We built SafeTea this way on purpose: when safety information lives behind a single platform's approval, it can disappear overnight.

*(Word count: 78)*

*Rationale: pre-empts the #1 objection ("where do I download this?") and converts it into a brand virtue (independence). Closes with a one-line subtext that names AWDTSG's core failure without naming AWDTSG — a hook that resonates with the warm cohort and intrigues the cold one.*

---

## 4. "How It Works" — 3 Steps

**Step 1 — Open SafeTea**
> Open SafeTea in your browser or add it to your home screen — no app store required.

**Step 2 — Join your city**
> Join the women-only community in your city. Verified, moderated, and pseudonymous from the start.

**Step 3 — Share or search safely**
> Post red flags, search names you're matched with, or set up alerts. You stay anonymous; the community stays smart.

*(Each step ~15 words.)*

*Rationale: the steps now match the new front-door (browser, not download). "Verified, moderated, pseudonymous" earns trust with three concrete words instead of three vague ones.*

---

## 5. Trust / Credibility Block

*(Replaces the current "Featured In" + "Built for privacy" trust grids. Use placeholders where we don't have hard, verified numbers — do not invent.)*

**Headline:** Built for the women who already know what AWDTSG was missing.

**Trust pillars (4-up grid, with icon + 1 line each):**

1. **Pseudonyms only.** No real names. No real photos. No public profiles.
2. **Screenshot-aware.** Watermarks and content controls discourage leaks before they start.
3. **Human + AI moderation.** Real moderators backed by automated content review — every post, every day.
4. **You own the exit.** Delete your account and your data goes with it. No Meta-style data hostage situation.

**Social proof row (only ship with verified numbers):**
- <<VERIFY: total verified members across all cities — pull from production DB before publishing>>
- <<VERIFY: number of active cities with 100+ members — required for "X cities" claim>>
- <<VERIFY: press placements — only list outlets with confirmed coverage URLs (e.g., PR Newswire, Yahoo Finance, Digital Journal already cited on current page; reconfirm)>>

**Legitimacy line (already true, keep):**
> Operated by GET SAFETEA APP LLC. USPTO-registered trademark. DMCA designated agent on file. Veteran-founded.

*Rationale: trust on a safety product is built by what we *won't* do (leak, sell, dox), not by inflated stats. The four pillars are differentiation, not platitudes. All numeric claims are gated behind `<<VERIFY>>` so nothing fictional ships.*

---

## 6. "Coming to iOS" Waitlist Block

*(Warm, confident. Not apologetic. Placed near the footer — it's a nice-to-have, not the main path.)*

**Headline:** A native iOS app is on the way.

**Body:**
> We're polishing a SafeTea iOS app for the App Store. While Apple does its review, the full SafeTea experience already runs beautifully in your iPhone's browser — and adding it to your Home Screen takes about ten seconds. Drop your email below and we'll let you know the day the iOS app goes live. No spam, no countdown timers, just one email when it ships.

**Form fields:**
- Email address (required)
- Submit button: **Notify me at iOS launch**

**Microcopy under the form:**
> One email. Unsubscribe whenever.

*Rationale: positions the iOS app as a polish item, not a missing feature. "Polishing" and "review" are honest without being defensive. Saying "the full experience already runs beautifully" reassures the user that signing up today gives them everything — they're not on a waiting list for the product, just for an icon.*

---

## 7. FAQ Snippet

*(Three new entries to add to the existing FAQ schema block.)*

**Q: Why is there no SafeTea iOS app yet?**
> A native iOS app is in App Store review. While that completes, the full SafeTea experience runs in any iPhone browser — including Safari, Chrome, and Firefox. You can add SafeTea to your Home Screen in two taps and get an app-like icon, full-screen mode, and notifications. Nothing about your safety, account, or community is gated behind the native app.

**Q: Is the SafeTea web app secure?**
> Yes. SafeTea runs over HTTPS, stores nothing on your device that we wouldn't store in the native app, and uses the same privacy architecture across web, Android, and (when it launches) iOS. Pseudonyms are required, identity verification happens at signup, and moderation runs on every post regardless of which surface you're using. <<VERIFY: SOC 2 / encryption-at-rest specifics — only include if accurate; remove this sentence if not yet certified.>>

**Q: I'm on Android — will I lose access if you push everyone to iOS later?**
> No. Web and Android are first-class, permanent surfaces for SafeTea — not workarounds. Our community already runs on the web, and we're committed to keeping it that way regardless of what happens on the App Store. If you're on Android, install from Google Play or use the browser. Your account, your city, and your safety tools work the same way on every device.

*Rationale: each Q maps to a specific objection that comes up in onboarding and support. The iOS answer reframes "delay" as "review." The web-security answer earns trust without overclaiming. The Android answer addresses a real fear (platform-shift abandonment) directly — important because Android is our nearest-term install surface.*

---

## 8. Implementation Notes for the Engineer

- Replace the existing `<section class="hero">` block. New CTAs route: primary → `/onboarding`, secondary → `#ios-add-to-home` modal, conditional Android → Google Play URL once live.
- Remove the "Coming to iOS & Android soon" badge under the hero CTAs (replaced by the explainer block + waitlist).
- In the existing `MobileApplication` JSON-LD, remove `"https://apps.apple.com/TODO"` from `downloadUrl` until the App Store URL is real. Add the Play Store URL when live. Empty placeholders hurt SEO and rich-snippet trust.
- Add the three new FAQ entries to the existing `FAQPage` schema and to the visible `/faq` page.
- The "Coming to iOS" waitlist form should write to the same waitlist table the rest of the marketing site uses — it feeds the iOS-waitlist nurture sequence (see `ios-waitlist-nurture.md`).
- Do **not** add `<<VERIFY>>` placeholders to live HTML. Either ship with verified numbers or omit the line.
