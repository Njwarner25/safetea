# SYNC.md — cross-PC coordination

Append-only log. Newest entries at the top.

---

## 2026-05-15 — Apple Review rejection fixes (3 issues)

LinkHer iOS build 19 was rejected on three Guidelines. Two are fixable in code (done in this commit); two require manual changes in App Store Connect (action items below).

### 1. Guideline 2.1(a) — iPad Air 11" (M2) Log In button unresponsive — FIXED IN CODE

The Capacitor app loads `https://getsafetea.app/login`. The login page (`public/login.html`) centered the auth card with `display:flex; align-items:center; min-height:100vh` on `<body>`. On iPadOS 26 with the soft keyboard open (and Capacitor's `Keyboard.resize: "none"`), the centered card cannot scroll, so the Log In submit button gets clipped under the keyboard and appears unresponsive.

Changes (`public/login.html`):
- Body switched from flex-centered to `display:block; overflow-y:auto` so the page can scroll when the keyboard pushes content off-screen.
- `min-height: 100dvh` added alongside `100vh` to use the dynamic viewport unit on iPadOS 26 / iOS 17+.
- `.auth-container` now does the visual vertical centering via its own flex column with `padding-bottom: max(40px, env(safe-area-inset-bottom))` so the submit button always has breathing room above the keyboard.
- `.btn-primary` gets `touch-action: manipulation`, an explicit `min-height: 48px` (Apple HIG ≥ 44pt), and `position: relative; z-index: 1`.
- Tab-switch buttons now have `type="button"` (defensive — they're outside any `<form>` but native `<button>` default is `submit`).
- New `focusin` handler scrolls the active input into view so the submit button remains visible after the keyboard opens.

No build needed beyond redeploying the web. The Capacitor shell will pick up the changes on next launch (it loads from `https://getsafetea.app/login`).

### 2. Guideline 5.1.2(i) — App Tracking Transparency / Precise Location — APP STORE CONNECT METADATA FIX REQUIRED

**Verdict: option (b) — the app does NOT cross-app track. Privacy label is wrong.**

Code audit:
- Location is collected in `public/safelink.js`, `public/tether.html`, and `public/record-protect.js`.
- All three send coordinates ONLY to our own backend (`api.getsafetea.app`) for Safe Walk sessions, tether check-ins, and the user's own evidence recordings.
- Coordinates are shared only with **trusted contacts the user explicitly chose**, never with third parties, data brokers, or ad networks.
- Zero `AdSupport.framework`, zero `AppTrackingTransparency.framework`, zero `IDFA`, zero third-party ad SDKs in `package.json` or the Podfile.

Per Apple's ATT definition (https://developer.apple.com/app-store/user-privacy-and-data-use/), "tracking" means linking app data with third-party data for ads or sharing with data brokers. Our usage is App Functionality, not tracking. We should NOT add an ATT prompt — adding `NSUserTrackingUsageDescription` and calling `ATTrackingManager.requestTrackingAuthorization()` for a feature that isn't actually tracking would itself be a 5.1.2 violation.

**Action in App Store Connect → App Privacy:**
1. Open the Precise Location entry under Data Types.
2. Under "How is this data used?" — keep ✅ **App Functionality** (and "Other Purposes" if currently checked for the trusted-contact share).
3. **UNCHECK** the **Tracking** purpose if it's currently set.
4. Under "Is this data linked to the user's identity?" — leave as is (linked to user account, which is fine).
5. Save and resubmit. Do the same audit for any other Data Type currently marked as used for Tracking (it should be: none).

After saving the corrected labels, reply to the App Review team in Resolution Center explaining: "LinkHer does not track users across apps or websites owned by other companies, and does not share data with data brokers. Precise location is used solely for in-app safety features (Safe Walk, tether check-ins, evidence recording) and shared only with trusted contacts the user explicitly designates. We have corrected the App Privacy label to reflect this — Precise Location is no longer marked as used for Tracking purposes."

### 3. Guideline 2.3.10 — Screenshots contain third-party / mock UI — APP STORE CONNECT METADATA FIX REQUIRED

**Apple's actual complaint is about screenshot CONTENT, not device frames.** Apple is flagging screenshots that show simulated/mock UI or interfaces that look like third-party apps (Instagram-style feeds, fake texting UIs, social-media-style mockups, references to other platforms), rather than actual LinkHer app UI captured from a running build.

**Codebase audit:**

1. **No screenshot automation exists.** No Fastlane, no `Snapfile`, no `Fastfile`, no `Deliverfile`, no Xcode UI test snapshots, no `fastlane snapshot`, no detox screenshot config — nothing. Screenshots were uploaded to App Store Connect manually. (The only `screenshot`-named file in the repo is `safetea-mobile/utils/useScreenshotPrevention.ts`, an unrelated runtime hook that prevents users from screenshotting the React Native app via `expo-screen-capture`.)

2. **No existing screenshot files in the repo** at App Store dimensions. No `fastlane/screenshots/`, no `appstore/`, no `metadata/`, no `previews/`. The repo's large PNGs are all icons, splashes, city images, and the Alessia avatar pack — none are App Store screenshots.

3. **Likely source of the violation:** `public/index.html` (the marketing landing page) contains a "Name Watch" phone mockup with **mock content that explicitly references a competitor dating app**:
   ```html
   <div class="nw-phone-mockup"> … 
     <strong>"Warning about Jake M. from Hinge"</strong> …
   ```
   This is a marketing illustration on the public website, NOT a screen the real LinkHer app ever shows. If someone screenshotted this mockup (or any other "Showcase" section of the marketing site) and uploaded it as an App Store screenshot, Apple would correctly reject it as third-party/simulated UI not from the app.

**Action in App Store Connect → App Information → iOS App → Media Manager:**

1. Delete every currently-uploaded screenshot for every device size (6.9", 6.7", 6.5", 5.5", iPad 13", iPad 12.9", iPad 11", etc.).
2. Capture replacements ONLY from a running build of the LinkHer iOS app (Capacitor shell or RN shell). Do NOT screenshot the marketing site `getsafetea.app/` — it has demo mockups (Name Watch with "Hinge" reference, hero illustrations, etc.) that are not real app UI.
3. Recommended way to capture: install the latest TestFlight / dev build on an iPhone 16 Pro Max + iPad Air 11" (or use the Xcode iOS Simulator with `Cmd+S` / File → Save Screen). The Capacitor WebView screenshots look identical to native captures.

**What to capture — actual in-app screens to use, mapped to the LinkHer routes the Capacitor shell serves:**

| Marketing label | Actual screen / route to capture | What the screen shows |
|---|---|---|
| Safety Pulse | `/pulse.html` (after login) | Real-time safety watch session — inactivity timer, route deviation, missed-check-in detector |
| Emergency / Live Tracking | `/recording-status.html` | Active recording status with timer, GPS pin, "stop recording" controls |
| Check-in / Check-out | `/tether.html` | Create-a-tether session screen (set duration, pick trusted contact, start) |
| Safe Walk | `/safelink.html` and `/safelink-track.html` | Start Safe Walk + the contact-facing live tracking map |
| Area Alerts / Community feed | Whatever screen the post-login hub serves (note: `public/dashboard.html` is currently 0 bytes — the hub may be served from a different path; verify before screenshotting) |
| SOS flow | The SOS button + confirmation screen inside the post-login hub | Real SOS UI, not the marketing illustration |
| Login / Sign Up | `/login.html` | Already shipped; only worth using as a screenshot if it's a clean shot of the real form |

**What NOT to use as a screenshot source:**
- ❌ `public/index.html` Name Watch mockup (mentions "Hinge")
- ❌ `public/index.html` hero illustration / features showcase SVGs (`public/images/hero-illustration.svg`, `features-showcase.svg`) — these are marketing art, not app UI
- ❌ `public/images/linkher-safetea-banner.png` (cross-platform marketing banner)
- ❌ Any composite / "phone with mock content" hero image from any marketing page
- ❌ Anything that displays a logo or message styled to look like another app (Hinge, Bumble, Tinder, Instagram, etc.)

**After re-upload, reply in Resolution Center:** "We have removed and replaced all App Store screenshots. The new screenshots are captured directly from a running build of LinkHer on iPhone and iPad and show only actual in-app UI (Safety Pulse, Emergency Live Tracking, Tether check-in, Safe Walk live tracking, Community area alerts, SOS flow). No screenshots contain mocked third-party app UI or marketing illustrations."

There is no code change to commit for this Guideline — it is purely an App Store Connect media replacement.

---

## 2026-05-14 — Mac → PC: PUBLISH `/privacy` URGENTLY for App Store review

**Need:** Apple App Store submission requires a publicly-reachable Privacy Policy URL. We've set the URL in App Store Connect to:

  `https://getsafetea.app/privacy`

**Action for PC:** Please publish a route on getsafetea.app that serves the LinkHer privacy policy. The canonical content is staged at `safetea-capacitor/www/privacy.html` in this repo — copy it to wherever the marketing/legal pages live in the safetea repo (e.g. `pages/privacy.tsx` or `app/privacy/page.tsx`). It must:

- Return HTTP 200 (not 403 / Vercel challenge) for unauthenticated bot user-agents — Apple's review fetcher won't pass attack-challenge.
- Be reachable at exactly `https://getsafetea.app/privacy`.
- Render the LinkHer-branded policy text (NOT the SafeTea web policy, since these are separate brands).

**Why urgent:** Build 38 of LinkHer iOS is ready to submit for App Store review. If `/privacy` 403s or 404s when Apple's reviewer fetches it, we'll get rejected on metadata grounds (not even reaching feature review). Please prioritize.

If publishing under getsafetea.app is not possible, ping back with an alternative public URL and I'll update App Store Connect.
