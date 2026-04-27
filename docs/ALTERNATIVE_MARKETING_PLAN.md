# SafeTea Alternative Marketing Plan

**Context:** iOS App Store approval is delayed indefinitely. We can't rely on App Store discovery, ASO, or "Download on iOS" CTAs in the near term. This plan pivots SafeTea's go-to-market around assets we already control: the web platform (live on Vercel), the blog, and the community demand AWDTSG proved exists.

**Core thesis:** The iOS app was a *channel*, not the product. SafeTea works in any browser today. We market the web app as the primary product and treat mobile apps as a future bonus, not the launch.

---

## 1. Reframe the Product: Web-First, Not App-First

The single most important change. Stop describing SafeTea as a "dating safety app" and start describing it as a "dating safety community" or "dating safety platform." Apps need approval; communities do not.

**Concrete actions:**
- Rewrite landing page hero from "Download SafeTea" to "Join SafeTea — open in your browser, no app required"
- Replace App Store / Play Store badges with a single primary CTA: **"Start in browser"** → opens the existing web dashboard
- Add a PWA install prompt (`manifest.json` + service worker) so iOS users can "Add to Home Screen" and get an app-like icon without going through the App Store
- Add an Android-first secondary CTA. Google Play review is faster and more permissive — ship there even if iOS is stuck
- Keep an "iOS coming soon" waitlist field to capture demand without promising a date

---

## 2. Three Marketing Channels That Don't Need an App Store

### Channel A: Content / SEO (highest leverage, lowest cost)

We already have three blog posts and the AWDTSG positioning. Double down.

- **Cadence:** 2 posts/week for 90 days. Topics chosen by search volume in keywords like "is he safe to date," "[city] dating red flags," "AWDTSG alternative," "reverse image search dating profile"
- **Format:** long-form (1,500–2,500 words), keyword-targeted, internal links to the web app
- **City landing pages:** generate one indexable page per active city (`/city/austin`, `/city/nyc`, etc.) — already supported by `city.html`. Each ranks for "[city] dating safety" / "[city] AWDTSG"
- **Comparison content:** "SafeTea vs. AWDTSG Facebook groups," "SafeTea vs. Tea app" — these capture branded competitor traffic
- **Owner:** content lead. **Budget:** $0 if in-house, ~$300/post if freelanced

### Channel B: Short-form video (TikTok + Instagram Reels)

This is where the AWDTSG audience already lives, and where iOS approval is irrelevant.

- **Account positioning:** @safetea.app — "Tools and stories for safer dating"
- **Content pillars:**
  1. **Red-flag explainers** (15–30s): "3 signs his profile is fake," repurposed from blog post #1
  2. **Story reactions:** dueting/stitching public AWDTSG screenshots (with names redacted) and explaining what to watch for
  3. **Privacy education:** how location-sharing "safety" features actually leak data — pitches SafeTea's anonymous model
  4. **Behind-the-scenes:** building a women-led safety platform; founder voice
- **Cadence:** 5 posts/week. One viral video can outperform a year of paid ads in this niche
- **CTA:** "Link in bio → safetea.app" (web URL, no app needed)

### Channel C: Reddit + targeted communities

- **Subs:** r/dating_advice, r/AskWomen, r/TwoXChromosomes, r/datingoverthirty, r/Tinder, r/Bumble, city subs (r/AskNYC etc.)
- **Approach:** answer real questions with genuine value first (no link), build karma and credibility for 30 days, then occasionally mention SafeTea where relevant. Hard rule: never spam, always disclose affiliation
- **AMA play:** "I built an AWDTSG alternative because my friend got catfished — AMA" in r/IAmA or r/dating_advice. Has worked for similar founders
- **Discord/community presence:** start a SafeTea Discord for power users; convert blog readers into a sticky community while we wait on iOS

---

## 3. Distribution Plays That Don't Touch an App Store

- **Press / PR:** women's safety + dating tech is a hot beat. Pitch The Cut, Refinery29, Bustle, Glamour, local TV. Angle: "The AWDTSG successor that doesn't dox anyone." A single hit can drive 10k+ web signups
- **Influencer partnerships:** dating coaches and women's safety creators on TikTok/Instagram with 50k–500k followers. They earn a custom referral link to safetea.app and a flat fee + per-signup payout. Twenty creators × 1,000 signups each = 20k users with no App Store dependency
- **Campus ambassadors:** 10 universities, 1–2 student ambassadors each. Materials: posters with QR → safetea.app, Greek life partnerships, women's center co-marketing. Especially effective in cities where we want density
- **Cross-promotion with women's safety orgs:** Stop Street Harassment, RAINN affiliates, local DV nonprofits. Offer free SafeTea+ for their audiences in exchange for newsletter mentions

---

## 4. Sequencing (Next 90 Days)

**Weeks 1–2 — De-risk the iOS dependency**
- Replace app-store-first CTAs with browser/PWA-first CTAs across landing, blog, social bios
- Ship a PWA manifest + service worker so the web app installs cleanly on iOS home screens
- Submit Android build to Google Play (separate, faster pipeline)

**Weeks 3–6 — Light the content engine**
- Hire/assign content lead, ship 2 posts/week, generate 25 city pages
- Launch TikTok + Instagram with first 20 videos; commit to daily for 6 weeks before evaluating
- Open Discord, seed it with first 100 users from the existing waitlist

**Weeks 7–12 — Scale what works**
- Pick the top 1 of 3 channels by signups/$ and double the budget
- Run the PR push once we have ~5k web users (provides a real "thousands of women using it" data point)
- Recruit first 10 influencers + first 5 campus ambassadors

---

## 5. Metrics That Actually Matter (Without an App Store)

Forget App Store rankings. Track:
- **Weekly web signups** (baseline target: 500/wk by week 8, 2,000/wk by week 12)
- **PWA installs** (proxy for "app-like" engagement on iOS)
- **D7 retention** on the web app — if this is healthy, the iOS delay is irrelevant
- **City density** — number of cities with 100+ active users (network-effect threshold)
- **Cost per signup by channel** — kill anything above $5 CAC, double anything under $1

---

## 6. What We're NOT Doing

- Paying for iOS-targeted ads while approval is pending — wasted spend
- Promising launch dates we can't control
- Rebuilding the product to "fix" something Apple flagged before we know what they flagged. If/when we get specific feedback, address it surgically
- Holding the marketing back waiting for iOS. The web product is the product

---

## 7. If iOS Stays Blocked Long-Term

The web-first approach becomes permanent strategy, not a workaround. Many successful consumer products (Substack, Notion-for-mobile until late, early Discord) grew on the web first. SafeTea's privacy-first positioning actually pairs well with "no app required, no app needed in your phone" — a feature for the privacy-conscious user we're targeting.

If web + Android together hit 50k MAU before iOS approves, we'll have leverage in the App Store appeal process *and* a business that doesn't need them.
