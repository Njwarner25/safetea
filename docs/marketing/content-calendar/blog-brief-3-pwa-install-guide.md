# Editorial Brief — Post #3: PWA Install Guide for iPhone

**Post slug:** `install-safetea-iphone-no-app-store`
**Publish date:** Monday, May 11, 2026
**Pillar:** Tools & How-To
**Author byline:** SafeTea Team
**Voice references:** `docs/blog/safewalk-date-sharing-privacy-guide.md` (closest analog — step-by-step, second-person, no marketing fluff)

---

## Final title (H1)

**How to Install SafeTea on Your iPhone (No App Store Required)**

_Why this title:_ Captures the highest-intent query from iOS users searching the App Store and not finding us. "No App Store required" is the differentiator and the keyword we want to own. Avoids any implication that we're "missing" from the App Store — we're framed as a deliberate web-first product.

## Meta title (≤ 60 chars)

`Install SafeTea on iPhone: No App Store Needed (Guide)` (53 chars)

## Meta description (≤ 155 chars)

`SafeTea works on iPhone without the App Store. Add it to your home screen in under 60 seconds — same icon, same experience, no download required.` (149 chars)

---

## Target keyword + search intent

- **Primary keyword:** "install web app on iPhone" — est. 1,600 monthly US searches `<<VERIFY-VOLUME>>`
- **Supporting keywords:**
  - "add to home screen iPhone" (~6,400 `<<VERIFY-VOLUME>>` — broad, but we'll only capture intent-aligned slice)
  - "SafeTea iOS" (branded — captures users searching the App Store and not finding us)
  - "SafeTea app iPhone"
  - "PWA install iOS"
  - "SafeTea download"
- **Search intent:** Mixed — branded navigational ("SafeTea iOS download") + transactional how-to ("add to home screen iPhone"). Reader has either heard about SafeTea elsewhere and wants the iPhone version, or is generally curious about installing web apps on iOS. The post needs to convert both.

## Target word count

**1,500 words.** Step-by-step posts shouldn't bloat. Long enough to rank for the supporting "add to home screen" queries; short enough that a reader actually completes the install before bouncing.

---

## Outline

### Intro (no H2)
- One of the three hooks below.
- Establish: SafeTea works in any browser, including Safari on iPhone, and you can give it a home-screen icon that behaves like an app.
- Reframe upfront: this is not a workaround. The web app is the product. iOS users get the same experience — same screening tools, same SafeWalk, same community — without the App Store middleman.

### H2: Why SafeTea is web-first by design
- Two paragraphs, no more. The privacy angle: a web app does not require you to grant the same permissions a native app does. The independence angle: a platform that depends on the App Store can be removed by the App Store.
- This is the section that turns a "where's the iOS app?" reader into a "actually that's a feature" reader. Do not skip it.

### H2: What you'll get when you install SafeTea on your iPhone
- Bullet list of what works:
  - Home-screen icon (looks and opens like an app)
  - Full-screen experience (no Safari address bar)
  - All SafeTea features: profile screening, SafeWalk, community reports, city pages
  - Push notifications (where iOS supports PWA push — note iOS 16.4+)
- One bullet on what is *different*:
  - No App Store updates — the app updates itself silently when you open it. (Frame as a benefit: no waiting for review, no "update required" popups.)

### H2: How to install SafeTea on your iPhone, step by step
- Numbered steps, exactly the format used in `safewalk-date-sharing-privacy-guide.md`.

**Step 1: Open Safari and go to getsafetea.app.**
- Specifically Safari, not Chrome or another browser. (iOS only allows home-screen install from Safari.)
- Include a one-line note: "If you opened this post in another browser, copy the link and paste it into Safari first."

**Step 2: Tap the Share button.**
- The square-with-an-up-arrow icon at the bottom of Safari (or the top, on iPad).
- Note that the location of the share button changed across recent iOS versions — describe the icon, not the position.

**Step 3: Scroll down and tap "Add to Home Screen."**
- It's about halfway down the share menu. If you don't see it, swipe up on the menu to scroll.

**Step 4: Confirm the name and tap Add.**
- The default name will be "SafeTea." You can change it if you want — most people leave it.

**Step 5: Open SafeTea from your home screen.**
- The icon will appear on your home screen like any other app.
- Tap it. SafeTea opens full-screen, with no browser bar.

### H2: How to make sure notifications are working
- Brief: open the home-screen icon at least once, then go to Settings → SafeTea → Notifications and confirm they are enabled.
- Note: Apple introduced PWA push notification support in iOS 16.4. Older versions can still install the home-screen icon but will not receive push notifications. Recommend updating iOS if needed, do not pretend the limitation does not exist.

### H2: Troubleshooting: common install issues
- "I don't see Add to Home Screen." → You probably opened the link in Chrome or another browser. iOS only supports this from Safari. Copy the URL and paste it into Safari.
- "The icon opens in Safari instead of full-screen." → That happens when the manifest didn't load correctly the first time. Open SafeTea in Safari again, wait for it to fully load, then re-add to the home screen.
- "Notifications are not working." → Confirm iOS 16.4 or later, then open the home-screen app at least once before checking notification permissions.
- "Will this take up the same storage as a regular app?" → No. PWAs use far less storage than native apps. SafeTea is typically under 10 MB cached.

### H2: How is this different from a "real" app?
- Honest answer. The home-screen install gives you 95% of what a native app does: an icon, full-screen experience, push notifications (on iOS 16.4+), and offline support for already-loaded content.
- What it does *not* do (yet): integrate with iOS Shortcuts, appear in the App Library category sorting, or use Apple Pay. None of these matter for SafeTea's core use cases.
- One line about the App Store status: "SafeTea is also pursuing native iOS distribution, but the web-first product is the way SafeTea was designed to work — and the install above gives you the full feature set today." Keep it brief, do not promise dates.

### H2: Frequently asked questions
- Five Q&As (see FAQ section below). Rendered with FAQ schema.

### Closing CTA (no H2 — short)
- One paragraph. "Once SafeTea is on your home screen, you have the same dating-safety tools as anyone using us in the browser — profile screening, SafeWalk, your city's community, all behind one icon. Get started at [getsafetea.app](https://getsafetea.app)."

---

## Recommended internal links

| Anchor text | Target | Where in post |
|---|---|---|
| "SafeTea's SafeWalk feature" | `/blog/safewalk-date-sharing-privacy-guide` | "What you'll get" section |
| "AI-powered profile screening" | `/blog/10-red-flags-ai-detects-dating-profiles` | "What you'll get" section |
| "find your city's community" | `/city` | "What you'll get" section |
| "SafeTea's privacy promise" | `/privacy` | "Why SafeTea is web-first" section |
| "open SafeTea now" | `getsafetea.app` (rendered as a clickable canonical URL) | Closing CTA |

## Recommended outbound citations

- **Apple's iOS 16.4 release notes mentioning PWA push notifications** — single most credible source for the "iOS 16.4+ for push" claim. Link to Apple's developer documentation.
- **MDN Web Docs on Web App Manifest** — for the technical claim that the home-screen icon comes from the manifest. Optional, lifts authority for SEO without bloating the post.
- **Apple Support article on "Add to Home Screen"** — first-party source for the install steps.

> No outbound links to "best PWA install guides" content-farm posts. Apple, MDN, or nothing.

---

## 3 hook intro options

### Hook A — Reader-direct (recommended)

> If you searched the App Store for SafeTea and could not find it, that is by design. SafeTea is a web app, which means it runs in any browser on any device — including the Safari browser already on your iPhone. And in about sixty seconds, you can give it a home-screen icon that opens full-screen, behaves like an app, and works exactly the same as the native version of SafeTea would.
>
> Here is how to do it, and why it is actually a better setup for a privacy-focused safety tool than a traditional App Store download.

### Hook B — Reframe / privacy-led

> The way most apps get on your phone goes like this: you download from the App Store, you grant a long list of permissions, the app gets installed updates the App Store decides to ship, and the data you generate lives somewhere you cannot see.
>
> SafeTea does it differently. SafeTea is a web app, which means it runs in your browser, requests only the permissions it actually needs, and stays under your control. This guide shows you how to add SafeTea to your iPhone home screen so it looks and feels like any other app — without giving up the privacy advantages of running in the browser.

### Hook C — Practical / fast

> Sixty seconds. That is how long it takes to put SafeTea on your iPhone home screen, with a clean icon, full-screen launch, and the same feature set as the browser version. No App Store. No download. No permissions list.
>
> Below is the exact process, the troubleshooting for the two or three things that occasionally go wrong, and a short explanation of why this is actually the way SafeTea is designed to work.

**Recommendation:** **Hook A** for canonical. It directly addresses the most common reader path (searched App Store, didn't find us, ended up here) and reframes the situation without being defensive. Hook B is better for sharing in the privacy-focused subreddits.

---

## FAQ section (FAQ schema)

Render with FAQPage JSON-LD and as visible H3s.

**Q1: Why isn't SafeTea on the iOS App Store?**
> SafeTea is a web app by design. The full feature set runs in any modern browser, which means we can ship updates instantly, support more devices, and avoid the privacy tradeoffs that come with native app installations. Adding SafeTea to your home screen gives you an app-like icon and full-screen experience without the App Store middleman.

**Q2: Is the home-screen version of SafeTea different from the browser version?**
> No. It is the same product, accessed the same way. The only difference is the launch experience — tapping the home-screen icon opens SafeTea full-screen without the Safari address bar, which makes it feel more like a traditional app. All features work identically.

**Q3: Do I need iOS 16.4 or higher to install SafeTea?**
> You can add SafeTea to your home screen on any version of iOS that supports Safari, going back several years. Push notifications specifically require iOS 16.4 or higher. If your iPhone is on an older version, the home-screen icon and core experience will still work — you just will not get push notifications until you update.

**Q4: Will the home-screen install update automatically?**
> Yes, automatically and silently. Because SafeTea is a web app, you always get the latest version when you open it. There are no "update available" prompts, no waiting for App Store review, and nothing to manage.

**Q5: How do I uninstall SafeTea from my home screen?**
> Press and hold the SafeTea icon on your home screen, then tap "Remove App." iOS will ask whether you want to remove it from the home screen or also delete the related browser data. Choose what you prefer. Removing the home-screen icon does not delete your SafeTea account.

---

## Production checklist for the writer

- [ ] Front matter: `title`, `slug: install-safetea-iphone-no-app-store`, `date: 2026-05-11`, `author: SafeTea Team`, `category: How-To Guide`, `description`, `tags: [PWA, iOS, install guide, iPhone, home screen, web app]`
- [ ] One H1, H2s for major sections, H3s reserved for FAQ
- [ ] Numbered steps formatted exactly the same as in `safewalk-date-sharing-privacy-guide.md` (bold step name + paragraph)
- [ ] Include 1–2 screenshots if available (Safari share menu + Add to Home Screen confirmation). Screenshots dramatically improve completion rate on how-to posts. Flag with `<<INSERT SCREENSHOT: Safari share menu showing Add to Home Screen>>` if not yet captured
- [ ] FAQ schema injected (5 Q&As)
- [ ] At least 4 internal links per the table above
- [ ] At least 2 outbound citations to Apple / MDN
- [ ] **Critical:** zero "iOS download" CTAs. The point of the post is to route around the App Store. Every CTA is a web URL or a home-screen install instruction
- [ ] **Critical:** no apologetic language about not being on the App Store. The framing is "by design," not "not yet." Per `ALTERNATIVE_MARKETING_PLAN.md`: web-first is the strategy, not a workaround
- [ ] No promised launch dates for native iOS, ever
- [ ] Last-updated date matches publish date

## Notes for the writer

- The framing of this post is the most important part. We are not apologizing for being a web app. We are explaining why being a web app is the better default for a privacy-focused safety tool. Read `ALTERNATIVE_MARKETING_PLAN.md` section 1 before writing to absorb the positioning.
- Do not promise that SafeTea will be on the App Store. Do not promise that it won't. The line is: "SafeTea is also pursuing native iOS distribution" — present tense, no commitment, no date.
- This post will get re-shared every time someone asks "is there an iOS app?" in our Reddit, Discord, and support channels. Make it the canonical answer.
- If a screenshot or step is unclear, use a `<<VERIFY: confirm step shown is current as of iOS 18>>` flag rather than guessing.
