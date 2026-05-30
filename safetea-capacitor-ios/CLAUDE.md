# safetea-capacitor-ios — iOS LinkHer Capacitor shell

**This directory ships ONLY the iOS LinkHer build. Do not touch it for Android or web work.**

## What this is

A Capacitor wrapper that loads `https://getsafetea.app` in a native iOS WebView. The web app is the source of truth for layout, design, flows, copy, and behavior. Capacitor adds:
- Native iOS app bundle (icon, splash, permission strings)
- StoreKit IAP plugin for subscriptions
- Native push notifications
- Camera / location / photo-library permission bridges

The actual `ios/` Xcode project is generated on a Mac via `npx cap add ios`. It is **gitignored** and lives only on the developer's Mac, not in this repo.

## Strict rules — read before changing anything

1. **Do NOT add React Native, Expo, or any JS framework here.** This is a thin Capacitor shell. The web build at `getsafetea.app` is what users see.
2. **Do NOT redesign or rebuild screens.** All UI lives on the web.
3. **Do NOT add features here.** Features are added on the web (`public/` in this repo). They flow to iOS automatically through the WebView.
4. **Do NOT change `appId` or `appName`.** They are fixed at `app.linkher.mobile` / `LinkHer` and match a provisioning profile in App Store Connect. Changing them breaks code-signing.
5. **Do NOT touch `../safetea-capacitor/`** (Android SafeTea build) or `../safetea-mobile/` (legacy RN app). Edits there must not be made from an iOS task.
6. **Do NOT remove the iOS-only `?app=linkher` theming hooks** if/when they're added to `server.url`. They exist for Apple Guideline 4.3 compliance.

## What you CAN do here

- Edit `capacitor.config.json` for iOS-specific Capacitor settings (splash duration, permission text, plugin config) — keep it iOS-only, never reintroduce an `android` block.
- Bump `package.json` version when shipping a new TestFlight build.
- Add iOS-only Capacitor plugins (StoreKit IAP, share extension, etc.) to `dependencies`.

## Build / submit flow (Mac only)

```bash
cd safetea-capacitor-ios
npm install
npx cap add ios          # first time only
npx cap sync ios         # after any config / web change
npx cap open ios         # opens Xcode
# In Xcode: Signing → Team DZ3NZHNLHX, Bundle ID app.linkher.mobile
# Product → Archive → Distribute → App Store Connect → Upload
```

After `cap add ios`, the generated `ios/App/App/Info.plist` needs the LinkHer permission strings (camera, location, mic, photo library) — see `IOS_QUICK_FIX.md` §3.2 on the `claude/check-ios-deployment-ju4Qm` branch for the exact copy.

## Source of truth for the broader rebrand

- `IOS_QUICK_FIX.md` — execution plan
- `IOS_REBRAND_RECOVERY.md` — user-authored brief on what NOT to do
- `IOS_REMEDIATION_PLAN.md` — long-form gap analysis

All three live on `claude/check-ios-deployment-ju4Qm`. When that branch merges to `main`, copy them here so they travel with the iOS project.
