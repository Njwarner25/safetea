# iOS LinkHer — Mac Handoff

**Branch:** `ios-capacitor-rebrand-config`
**Commit:** `270b04e — feat(ios): split iOS LinkHer Capacitor build into safetea-capacitor-ios/`
**Audience:** the human or Claude session running this on a Mac with Xcode + an Apple Developer account.

This file is the runbook. Do these steps in order. If a step fails, stop and surface the failure — do not improvise around it.

---

## Why this directory exists

iOS LinkHer needed a different `appId` and `appName` than Android SafeTea. The previous shared `safetea-capacitor/capacitor.config.json` would have retagged the Android binary the next time anyone ran `npx cap sync android`. To prevent that, iOS now has its own physically-separate Capacitor project here in `safetea-capacitor-ios/`.

**Hard rule: do not edit `../safetea-capacitor/` (Android) or `../safetea-mobile/` (RN) from this task.** Each directory has a `CLAUDE.md` documenting its scope.

---

## 0. Sync the branch on Mac

```bash
cd ~/safetea
git fetch origin
git checkout ios-capacitor-rebrand-config
git pull origin ios-capacitor-rebrand-config
```

Verify you see `safetea-capacitor-ios/` in the working tree. If not, stop — the branch isn't checked out correctly.

---

## 1. Bootstrap the iOS Xcode project

```bash
cd ~/safetea/safetea-capacitor-ios
npm install
npx cap add ios
npx cap sync ios
```

This creates `safetea-capacitor-ios/ios/App/App.xcworkspace` (gitignored — stays on the Mac).

If `npx cap add ios` fails with a CocoaPods error: `sudo gem install cocoapods` then re-run.

---

## 2. Confirm capacitor.config.json values

Open `safetea-capacitor-ios/capacitor.config.json` and verify:

- `"appId": "app.linkher.mobile"` ← matches the provisioning profile
- `"appName": "LinkHer"` ← matches App Store Connect listing
- `"server.url": "https://getsafetea.app"` ← keep as-is for now (see §6 for the LinkHer-themed URL option)

If any are wrong, fix them and re-run `npx cap sync ios`.

---

## 3. Edit Info.plist permission strings

Open `safetea-capacitor-ios/ios/App/App/Info.plist` (in Xcode or a text editor). Add or update these keys with the exact LinkHer copy below — Apple's reviewer reads them verbatim:

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

<key>NSPhotoLibraryAddUsageDescription</key>
<string>LinkHer can save photos and exported safety records to your Photos library.</string>

<key>ITSAppUsesNonExemptEncryption</key>
<false/>
```

Any string still saying "SafeTea" must change to "LinkHer". The previous SafeTea rejection from Apple Review reads these.

---

## 4. App icon + splash screen

The user has a designed icon set with three variants: full-color, dark mode, and light/tinted (iOS 18+). The icon must look **integrated with the app, not pasted on**.

Two specific causes of the "pasted on" look in the current build:

1. **Rounded corners baked into the source PNG.** iOS applies its own corner mask (continuous "squircle"). If the source is already rounded, you get a rounded shape inset inside another rounded shape. Re-export the source as a **flat 1024×1024 square** with the gradient extending edge-to-edge.
2. **Splash background and icon dark-BG must match exactly.** Sample with a color picker — they're both `#1A1A2E` per `capacitor.config.json` but confirm against the icon export.

### Asset paths

Drop the new PNGs into `safetea-capacitor-ios/assets/` (create the directory):

| Variant | File | Specs |
|---|---|---|
| Full color (default) | `assets/icon-linkher.png` | 1024×1024, RGB, no alpha, no rounded corners |
| Dark appearance (iOS 18+) | `assets/icon-linkher-dark.png` | 1024×1024, RGBA OK |
| Tinted/light (iOS 18+) | `assets/icon-linkher-light.png` | 1024×1024, RGBA, single-color usable |
| Splash logo | `assets/splash-linkher.png` | 1254×1254, transparent BG |

### Generate

```bash
cd ~/safetea/safetea-capacitor-ios
npx @capacitor/assets generate \
  --iconBackgroundColor '#1A1A2E' \
  --iconBackgroundColorDark '#1A1A2E' \
  --splashBackgroundColor '#1A1A2E' \
  --splashBackgroundColorDark '#1A1A2E' \
  --assetPath assets/icon-linkher.png

npx cap sync ios
```

For iOS 18+ dark/tinted appearances, after `cap sync` open Xcode → `App → Assets.xcassets → AppIcon` → drop the dark and tinted PNGs into the Dark and Tinted slots, then update `Contents.json`. Reference: https://developer.apple.com/documentation/xcode/configuring-your-app-icon

Verify the icon at every size shows edge-to-edge gradient with no inset square.

---

## 5. StoreKit IAP wiring

Capacitor doesn't have a first-party IAP plugin. Use **`cordova-plugin-purchase`** (better-maintained for StoreKit 2 than alternatives):

```bash
cd ~/safetea/safetea-capacitor-ios
npm install cordova-plugin-purchase
npx cap sync ios
```

Then in the web bundle (separate task on `public/app.js` — coordinate with whoever's editing web):

1. Detect `window.cordova` to know we're inside the iOS WebView.
2. Register products: `linkher.plus.monthly`, `linkher.plus.yearly` via `window.CdvPurchase.store.register({...})`.
3. On purchase success, call `POST /api/iap/verify-receipt` with `{ receipt, platform: 'ios' }` — the endpoint already accepts `linkher.plus.*` (server commit `07aa032`) and will return the upgraded user with `tier: 'plus'`.
4. Subscription buttons in the iOS bundle must NOT route through Stripe — Apple rejects under Guideline 3.1.1 if they do.

The reference implementation lives at `safetea-mobile/services/iap.ts` (RN version) — port the `verifyReceipt` flow logic, not the React code.

---

## 6. Apple Guideline 4.3 — themed bundle (optional but recommended)

If `server.url` stays `https://getsafetea.app`, the WebView shows SafeTea branding and Apple may flag this as the same SafeTea binary they previously rejected (Guideline 4.3 — duplicate apps).

**Mitigation: query-param theming** (per `IOS_QUICK_FIX.md` §3.5.A on `claude/check-ios-deployment-ju4Qm`):

1. The web bundle reads `?app=linkher` once at boot in `public/app.js` and sets `document.documentElement.setAttribute('data-app', 'linkher')`.
2. `public/style.css` adds `[data-app="linkher"]` overrides (LinkHer purple palette, "SafeTea" → "LinkHer" string swaps).
3. Update this file's `capacitor.config.json` `server.url` from `https://getsafetea.app` to `https://getsafetea.app/?app=linkher`.
4. Re-run `npx cap sync ios`.

The web theming is being done on a separate branch — check `origin/claude/general-session-iI4w9` ("rebrand JS now swaps SafeTea logos + strips teacup emojis") for the latest. Coordinate with whoever owns that work before merging.

---

## 7. Build, archive, submit

```bash
cd ~/safetea/safetea-capacitor-ios
npx cap sync ios
npx cap open ios
```

In Xcode:

1. **Signing & Capabilities** tab on the `App` target:
   - Team: `DZ3NZHNLHX` (Nathaniel Warner)
   - Bundle Identifier: `app.linkher.mobile`
   - Capabilities: confirm Push Notifications and In-App Purchase are enabled
2. **General** tab:
   - Display Name: `LinkHer`
   - Version (Marketing): bump per the App Store Connect TestFlight build number policy
   - Build (CFBundleVersion): increment from the last submitted value
3. **Product → Destination → Any iOS Device (arm64)**.
4. **Product → Archive**. Wait for archive to complete (~3-10 min depending on machine).
5. In the Organizer window that opens: **Distribute App → App Store Connect → Upload**.
6. After upload, the build appears in App Store Connect TestFlight after ~10-30 min processing.

If Xcode signing fails: in the Apple Developer portal, confirm the `app.linkher.mobile` provisioning profile is active and the Mac's keychain has the matching certificate.

---

## 8. Smoke-test before App Review submission

On a real iOS device via TestFlight:

- [ ] App icon shows edge-to-edge gradient on the home screen, no inset square.
- [ ] Tapping the icon opens to a splash matching the icon's background.
- [ ] Inside the app, the WebView loads `getsafetea.app` (or `?app=linkher` if §6 done).
- [ ] All visible "SafeTea" text reads "LinkHer" (header, footer, copy).
- [ ] Login (SMS) works.
- [ ] Camera permission prompt fires when entering Photo Verify and matches the Info.plist string.
- [ ] Location permission prompt fires when entering SafeWalk / SOS and matches the Info.plist string.
- [ ] Photo library permission prompt fires when entering Conversation Scanner and matches the Info.plist string.
- [ ] StoreKit IAP — tap Subscribe → Apple sandbox sheet appears (not a Stripe page). Test purchase succeeds and tier upgrades to `plus`.
- [ ] Photo Verify upload works.
- [ ] Safety Vault folder creation works.
- [ ] Conversation Scanner accepts a screenshot upload.

Any failure → file a bug, fix on web (`public/`) since iOS just shows the WebView, re-cycle.

---

## 9. After submission

- Wait for Apple Review feedback (typically 1-3 days).
- If rejected for Guideline 4.3 (duplicate of SafeTea): make sure §6 themed bundle is wired, the LinkHer palette is visibly different, and the wordmark is "LinkHer" everywhere.
- If rejected for Guideline 5.1.1(viii) (data tracking): ensure Background Check is fully removed (it was removed at server commit `b6cb160`) and Name Ping framing emphasises user-driven monitoring of community posts, not third-party data.

---

## What NOT to do

- ❌ Do not introduce React Native into this directory.
- ❌ Do not edit `../safetea-capacitor/` (Android) or `../safetea-mobile/` (legacy RN).
- ❌ Do not change `appId` or `appName` from `app.linkher.mobile` / `LinkHer` — code-signing depends on them.
- ❌ Do not redesign screens — the web app is the source of truth.
- ❌ Do not add Stripe checkout buttons inside the iOS WebView (Apple Guideline 3.1.1 — IAP only for digital subscriptions).
- ❌ Do not commit the generated `ios/` Xcode project to git — it stays gitignored on the Mac.

## Reference docs (on `claude/check-ios-deployment-ju4Qm` branch)

- `IOS_REBRAND_RECOVERY.md` — user-authored brief on what NOT to do.
- `IOS_QUICK_FIX.md` — fuller execution plan, including web-side theming.
- `IOS_REMEDIATION_PLAN.md` — long-form gap analysis (most of it deferred since iOS = WebView now).

These should be merged into `main` (or copied to `safetea-capacitor-ios/`) when the iOS work lands.

---

**Next action:** run §0, then §1. If both succeed, you're set up to work through §2-§9 in order.
