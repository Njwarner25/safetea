# iOS Quick-Fix Plan

**Branch:** `claude/check-ios-deployment-ju4Qm`
**Audience:** Claude Code session executing this on a Mac with the repo cloned and `eas-cli` available.

This is the **focused** companion to `IOS_REMEDIATION_PLAN.md`. That file is the long inventory of every gap. **This file is the fastest path to a working iOS LinkHer build that matches what Android SafeTea users see today.**

---

## 1. Reality check — what's actually broken vs never existed

The iOS app the user is testing is the **React Native** shell at `safetea-mobile/`. Verified against the pre-rebrand commit `1833121` (last commit before PR #40): the iOS RN app **never had** Photo Verify, Safety Vault folder creation, Conversation Scanner screenshot upload, Direct Messages, or Sorority Rooms. Those features only ever existed on the web (`public/`) and reached Android users because Android ships via the **Capacitor WebView wrapper** at `safetea-capacitor/`. The rebrand did not remove them; the RN app simply never had them.

So when the iOS build reports "failed to upload photo in photo scanner" or "failed to create folder in safety vault", the failures aren't bugs in working code — those code paths don't exist in the RN bundle.

---

## 2. The decision

You have two paths. Pick one before doing anything else.

### Option A — Capacitor-on-iOS (recommended, ~1 day)

Ship iOS the same way Android already ships: bootstrap a Capacitor iOS project, point it at the LinkHer-branded web bundle, build the native shell with StoreKit IAP wired in, submit to TestFlight. Inherits **every** feature the web app has, instantly. Same backend, same DB, same code on the server side.

**Pros**
- Photo Verify, Vault, Convo Scanner, Sorority Rooms, DMs all work on day one because they're already built on web.
- Bug fixes ship to iOS the moment they ship to web — no separate native build.
- ~1 day to first TestFlight, vs ~3 weeks for Option B.

**Cons / risks**
- **Apple Guideline 4.2 (Minimum Functionality)** rejects "apps that are simply a song or movie should be submitted to the iTunes Store" and, by extension, apps that are pure WebView wrappers with no native value. Mitigations below.
- Native iOS look-and-feel is weaker than RN.

**4.2 mitigations (do these, not optional)**
1. **StoreKit IAP** is already built (`safetea-mobile/services/iap.ts`) — port it to a Capacitor plugin so subscription is done natively, not via web Stripe.
2. **Native push notifications** — use `@capacitor/push-notifications`, not web push. Apple wants iOS native notifications.
3. **Native splash + icon** — already in `safetea-mobile/assets/`. Reuse via Capacitor's splash plugin.
4. **Permission strings** in Info.plist (camera, location, mic) must use the LinkHer copy already in `safetea-mobile/app.config.ts:49-57`.
5. **Native share extension** (optional but strong signal) — share-to-LinkHer from any iOS app to feed into the conversation scanner.

### Option B — Native RN buildout (~3 weeks)

The path described in `IOS_REMEDIATION_PLAN.md` §5. Build every missing feature natively in React Native. Better long-term native UX, no 4.2 risk, but a multi-week project. Don't pick this unless Option A's 4.2 risk is unacceptable.

---

## 3. Option A — execution plan

> Stop here if you picked Option B and follow `IOS_REMEDIATION_PLAN.md` instead.

### 3.1 Bootstrap Capacitor iOS

Working directory: `safetea-capacitor/`.

```bash
cd ~/safetea/safetea-capacitor
npm install

# Create the iOS native project (Xcode required on the Mac running this)
npx cap add ios

# Sync the existing capacitor.config.json + web bundle into iOS
npx cap sync ios
```

**Required edits to `safetea-capacitor/capacitor.config.json`:**

- `appId`: change to **`app.linkher.mobile`** (matches the provisioning profile already uploaded to EAS — don't re-use `app.getsafetea.mobile`).
- `appName`: change to **`LinkHer`**.
- `server.url`: stays `https://getsafetea.app` for now (see §3.5 for the LinkHer-themed bundle option).

After editing, re-run `npx cap sync ios`.

### 3.2 Configure native iOS Info.plist

Open `safetea-capacitor/ios/App/App/Info.plist` and confirm:

```xml
<key>CFBundleDisplayName</key>
<string>LinkHer</string>

<key>NSCameraUsageDescription</key>
<string>LinkHer uses the camera for identity verification selfies and photo evidence.</string>

<key>NSLocationWhenInUseUsageDescription</key>
<string>LinkHer uses your location to share your GPS coordinates with trusted contacts during an SOS alert.</string>

<key>NSMicrophoneUsageDescription</key>
<string>LinkHer uses the microphone for audio safety features.</string>

<key>NSPhotoLibraryUsageDescription</key>
<string>LinkHer needs photo access so you can upload evidence to Safety Vault and screenshots to the Conversation Scanner.</string>

<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

If any are missing or still say "SafeTea", fix them. Apple parses these and surfaces them at the App Review stage.

### 3.3 Replace icon and splash

The user has a designed icon set (full-color / dark / light variants + a wordmark with the tagline "Stay Connected. Stay Safe."). The brief is that the logo should feel **integrated with the app, not pasted on**. That means three things:

1. **Source PNG must be a flat 1024×1024 square — no rounded corners baked in.** iOS applies its own corner radius (a continuous "squircle" curve) to whatever you give it. If the export already has rounded corners, the OS rounds it again and you end up with a rounded shape inset inside another rounded shape, which is the "placed on, not part of" look the user is complaining about. The mockup the user sent shows rounded corners because the mockup itself draws them — the actual export needs to be edge-to-edge gradient.
2. **The splash background and the icon's dark-mode background must use the same color** — currently both `#0D0B1A` per `safetea-mobile/app.config.ts:31`. Confirm this matches the dark variant exactly. If the icon's BG is, say, `#0A0918`, update both the icon export and `LINKHER.splashBg` to match.
3. **In-app accent colors should pull from the icon's gradient**, so a user looking at the home screen icon and then opening the app sees the same palette. The icon gradient looks like roughly `#FF3D7F → #7B2FFF` — sample the exact stops from the design source and map them to `Colors.coral` / `Colors.pink` / `Colors.notificationColor` in `safetea-mobile/constants/colors.ts`.

**Asset paths to drop the new PNGs into:**

| Variant | Path | Specs |
|---|---|---|
| Full color (default) | `safetea-mobile/assets/icon-linkher.png` | 1024×1024, RGB, no alpha, no rounded corners |
| Dark appearance (iOS 18+) | `safetea-mobile/assets/icon-linkher-dark.png` | 1024×1024, RGBA allowed; transparent BG OK | 
| Tinted/light appearance (iOS 18+) | `safetea-mobile/assets/icon-linkher-light.png` | 1024×1024, RGBA, single-color usable |
| Splash logo (smaller, centered) | `safetea-mobile/assets/splash-linkher.png` | 1254×1254, transparent BG, drawn against `#0D0B1A` |
| Wordmark for login/welcome | `safetea-mobile/assets/wordmark-linkher.png` | 2× horizontal aspect, transparent BG |

Once the assets are in place:

```bash
# From safetea-capacitor/, generate the iOS icon set + splash
cd ~/safetea/safetea-capacitor
npx @capacitor/assets generate \
  --iconBackgroundColor '#0D0B1A' \
  --iconBackgroundColorDark '#0D0B1A' \
  --splashBackgroundColor '#0D0B1A' \
  --splashBackgroundColorDark '#0D0B1A' \
  --assetPath ../safetea-mobile/assets/icon-linkher.png

npx cap sync ios
```

For iOS 18+ dark/tinted icon support, after `cap sync` open `safetea-capacitor/ios/App/App/Assets.xcassets/AppIcon.appiconset/` in Finder and drop in:
- `icon-linkher-dark.png` as the **Dark** appearance.
- `icon-linkher-light.png` as the **Tinted** appearance.

Update `Contents.json` so each appearance points at the right file. Reference: https://developer.apple.com/documentation/xcode/configuring-your-app-icon

Verify in Xcode: `App → Assets.xcassets → AppIcon` should show three appearances filled in, and the icon at every size should look edge-to-edge gradient (no inset square).

**Wordmark integration:** Use `wordmark-linkher.png` as the headline image on `app/(auth)/welcome.tsx` and on the login splash inside `_layout.tsx`. Don't overlay text on top of the icon in code — the wordmark is a designed asset, treat it as one.

### 3.4 Wire StoreKit IAP

Capacitor doesn't have a first-party IAP plugin. Use **`@capacitor-community/in-app-purchases`** or **`cordova-plugin-purchase`** (better-maintained for StoreKit 2). Either way the wire-up is:

1. Install the plugin: `npm install cordova-plugin-purchase` (in `safetea-capacitor/`).
2. The plugin hooks the JS bridge so `window.CdvPurchase.store.register({ id: 'linkher.plus.monthly', type: 'paid subscription' })` works in the web bundle.
3. In `public/app.js` (web), detect `window.cordova` and route iOS subscription buttons through StoreKit instead of Stripe checkout. The existing safetea-mobile `services/iap.ts` is the reference implementation — port the `verifyReceipt` flow to call `https://api.getsafetea.app/api/iap/verify-receipt` (already accepts `linkher.plus.*` after commit `07aa032`).
4. Receipt format: StoreKit 2 returns a JWS token via `getReceiptIOS()`; Capacitor IAP plugins surface the legacy base64 receipt that the existing server endpoint expects. Confirm by logging `purchase.transactionReceipt` once before shipping.

### 3.5 LinkHer-themed web bundle (for Apple 4.3)

If `server.url` stays `https://getsafetea.app`, the WebView shows SafeTea branding and Apple may flag it as the same SafeTea binary they already rejected (Guideline 4.3 — same as the original rejection). Two ways to handle this:

**Option 3.5.A — Conditional theming (preferred, no new infra)**

The web bundle reads a query param or User-Agent and re-themes:
- `https://getsafetea.app/?app=linkher` triggers LinkHer palette + name.
- `public/app.js` checks `URLSearchParams` once at boot and sets `document.documentElement.setAttribute('data-app', 'linkher')`.
- `public/style.css` adds `[data-app="linkher"]` overrides for colors and replaces "SafeTea" → "LinkHer" via a JS string-replace pass on the rendered DOM (or inline templates if any).
- Set `server.url` in capacitor config to `https://getsafetea.app/?app=linkher`.

**Option 3.5.B — LinkHer-branded mirror domain**

DNS-alias `linkher.app` (or similar) to the same Vercel deployment. Set `server.url` to `https://linkher.app`. Server detects host header and serves LinkHer-themed HTML / strings. More infra cost, but cleaner for marketing later.

Pick A for speed. Add a runtime test that exercises the iOS path before submission — open Safari with `?app=linkher`, every "SafeTea" string should now read "LinkHer" and the palette should be the LinkHer purple.

### 3.6 Build and submit

```bash
cd ~/safetea/safetea-capacitor

# Build the web bundle (whatever the current process is — likely a no-op since
# public/ is served directly from the api.getsafetea.app deploy)
npx cap sync ios

# Open in Xcode
npx cap open ios

# In Xcode:
# 1. Signing & Capabilities → Team: DZ3NZHNLHX (Nathaniel Warner)
# 2. Bundle Identifier: app.linkher.mobile
# 3. Build → Archive → Distribute App → App Store Connect → Upload
```

Or use EAS for the iOS Capacitor build:

```bash
# (After eas.json is updated to point production builds at safetea-capacitor/)
eas build --platform ios --profile production --working-directory safetea-capacitor
```

---

## 4. The specific failures the user reported

Each of these is fixed automatically by Option A (the web has them today). If you stick with Option B (RN buildout), they need explicit native work:

| Reported | Reality | Fix under Option A | Fix under Option B |
|---|---|---|---|
| "Failed to upload photo in photo scanner" | Photo Verify isn't built in RN. The button presumably triggers a stub. | Inherits from web. `public/red-flag-scanner.html` and `api/photos/verify.js` already work. | `IOS_REMEDIATION_PLAN.md §5.4` — full native build. |
| "Failed to create folder in Safety Vault" | Vault folder creation isn't built in RN. `app/vault.tsx` is a marketing screen with a "Open on the web" CTA (now hidden on iOS via commit `b787496`). | Inherits from web. `public/vault.html` and `api/vault/folders.js` already work. | `IOS_REMEDIATION_PLAN.md §5.3` — full native vault. |
| "Chat scanner should allow uploading screenshots" | RN screening (`app/screening.tsx`) accepts profile name + platform, not screenshots. | Web's `public/red-flag-scanner.html` already accepts free-text input; **add a screenshot uploader** there: `<input type="file" accept="image/*">`, OCR via `api/photos/extract.js` (existing endpoint), feed extracted text into `api/screening/redflag.js`. One web change, both platforms benefit. | Add `expo-image-picker` to the RN screening screen, upload via `api/photos/upload.js`, then OCR + redflag scan. |

The chat-scanner screenshot upload is a feature gap on the **web** too (under Option A, the web is the source of truth, so the gap shows on both platforms until the web is fixed). Either way, a screenshot uploader is worth adding to the web first since it benefits Android and iOS.

---

## 5. Logo quality — the integration brief

The user has a designed icon set (three variants: full-color, dark mode, light/tinted mode + a wordmark "LinkHer / Stay Connected. Stay Safe."). The complaint isn't that the design is bad — it's that the icon looks **placed on the phone, not part of the app**. Two specific causes:

1. **Rounded corners baked into the source PNG.** The current `safetea-mobile/assets/icon-linkher.png` (or whatever's there) probably has the rounded-square shape rendered into the bitmap. iOS then applies *its own* corner mask, producing a small rounded shape inset inside the OS rounded mask — visually "placed on" rather than "part of". Re-export as a flat 1024×1024 square with gradient extending edge-to-edge.
2. **Splash and in-app palette don't match the icon gradient.** The icon dark-mode variant has a deep purple/black background; the app's splash uses `#0D0B1A` (close, possibly identical — confirm by sampling the icon BG). The icon's pink-to-purple gradient (~`#FF3D7F → #7B2FFF`) should drive the accent palette in `constants/colors.ts` so opening the app feels continuous with tapping the icon.

**Concrete acceptance criteria for "blended" logo:**
- Icon on the iOS home screen has no visible square outline inside the rounded mask.
- App splash screen background is exact-match to the icon's dark-mode background (sample with a color picker).
- The first thing the user sees inside the app — the welcome / login screen — uses the wordmark asset (not redrawn type) and accent colors that match the icon gradient.
- Notification color (`expo-notifications.color` in `app.config.ts:139`) is set to one of the icon gradient stops, not a generic pink.

See §3.3 for the asset paths and the export pipeline.

---

## 6. Quickest possible execution order (if Option A)

Fastest realistic timeline assuming a designer can deliver the icon in a day:

1. **Day 1 morning:** Bootstrap Capacitor iOS (§3.1). Edit `capacitor.config.json` (§3.1 again). Update Info.plist (§3.2). Verify the WebView loads `getsafetea.app` correctly on the iOS simulator.
2. **Day 1 afternoon:** Apple 4.3 mitigation — implement query-param-based LinkHer theming on the web (§3.5.A). Test in Safari, then in the iOS simulator.
3. **Day 2 morning:** Wire StoreKit IAP via `cordova-plugin-purchase` (§3.4). Verify subscription purchase completes in the iOS sandbox.
4. **Day 2 afternoon:** Drop in new icon asset (§3.3 + §5). Build IPA. Submit to TestFlight. Smoke-test the full flow on a real device.
5. **Day 3:** Fix anything TestFlight surfaces. Submit to App Review.

If the icon design takes longer than a day, the rest of the work proceeds in parallel — ship to TestFlight with the current "looks like trash" icon for internal testing, swap the icon before App Review submission.

---

## 7. What this plan does NOT do

- **Doesn't restore Background Check.** It violated 5.1.1(viii) and was fully removed in `b6cb160`. Don't put it back.
- **Doesn't re-enable Name Ping on iOS.** The runtime gate at `utils/platform.ts:isProfileBuildingAllowed()` is still active. If using Option A, the web app's Name Ping (a.k.a. Name Watch) IS visible on iOS by default — you'd need to add an `if (isIOS)` hide-it check in the web's tools page. See `IOS_REMEDIATION_PLAN.md §3` for the full Apple-compliance trade-off discussion.
- **Doesn't fix the login crash on the RN build.** If you're going Option A, the RN build is being shelved anyway. If you're keeping the RN build, see `IOS_REMEDIATION_PLAN.md §4.1`.

---

**Last updated:** 2026-05-05.
**Recommended path:** Option A (Capacitor-on-iOS) with §3.5.A LinkHer theming.
**First action:** Decide A or B, then execute §3.1 (Option A) or follow `IOS_REMEDIATION_PLAN.md §4.1` (Option B).
