# SafeTea Mobile — Capacitor Shell

This directory is the **iOS + Android native shell** for SafeTea. It does **not** contain a second copy of the UI — it loads `https://getsafetea.app` directly through a WKWebView (iOS) / WebView (Android), so whatever is deployed to Vercel *is* the mobile app. No drift, no phantom features, one source of truth.

> Replaces the legacy `safetea-mobile/` Expo project, which had drifted from the web and was showing features that no longer exist in the repo.

---

## What this gives you

- **1:1 parity with getsafetea.app** — ship a Vercel deploy, the mobile app picks it up on next cold start.
- **Native features** via Capacitor plugins: Camera (for Didit liveness), Push Notifications, Geolocation, Share, Haptics, Status Bar, Splash Screen, Browser.
- **One codebase, two stores** — iOS + Android built from this single folder.
- **ITMS-90725 ready** — pinned to Capacitor 7 / iOS 26 SDK / Xcode 26 (deadline: 2026-04-28).

## Prerequisites

### macOS build machine (required for iOS)
- **Xcode 26** or later (App Store)
- **CocoaPods** — `sudo gem install cocoapods`
- **Node 20+** — `brew install node`
- Apple Developer account (Nate has this) with bundle ID `app.getsafetea` provisioned

### Android (any OS)
- **Android Studio Ladybug** or newer
- **JDK 17** — `brew install openjdk@17` on Mac
- Google Play Console account ($25 one-time — still pending registration)

---

## First-time setup

Run from this folder (`safetea-capacitor/`):

```bash
# 1. Install JS deps
npm install

# 2. Generate native icon + splash from assets/icon.png and assets/splash.png
npx @capacitor/assets generate --iconBackgroundColor "#ffffff" --splashBackgroundColor "#ffffff"

# 3. Add native platforms (creates ios/ and android/ folders)
npx cap add ios
npx cap add android

# 4. Sync www/ and plugins into native projects
npx cap sync
```

After `cap add ios`, open the iOS project in Xcode:

```bash
npx cap open ios
```

In Xcode:
1. Select the **App** target → **Signing & Capabilities**
2. Set **Team** to Nate's Apple Developer team
3. Confirm **Bundle Identifier** = `app.getsafetea`
4. Add capabilities: **Push Notifications**, **Background Modes** (check "Remote notifications")
5. Open `ios/App/App/Info.plist` and confirm/add:
   - `NSCameraUsageDescription` — "SafeTea uses the camera for identity verification and photo uploads."
   - `NSLocationWhenInUseUsageDescription` — "SafeTea uses your location to show safety alerts in your city."
   - `NSPhotoLibraryUsageDescription` — "SafeTea lets you attach photos to reports and profiles."
   - `NSMicrophoneUsageDescription` — "SafeTea uses the microphone for voice memos in reports."

For Android:

```bash
npx cap open android
```

In Android Studio:
1. Wait for Gradle sync
2. Confirm `android/app/build.gradle` has `applicationId "app.getsafetea"`, `compileSdk 35`, `targetSdk 35`, `minSdk 24`
3. Generate a signing key (`keytool -genkey -v -keystore safetea-release.keystore -alias safetea -keyalg RSA -keysize 2048 -validity 10000`) and **store the keystore in 1Password — do NOT commit it**

---

## Building

### iOS (TestFlight)
```bash
npx cap sync ios
npx cap open ios
```
In Xcode: **Product → Archive → Distribute App → App Store Connect → Upload**.

### Android (Play Console Internal Testing)
```bash
npx cap sync android
npx cap open android
```
In Android Studio: **Build → Generate Signed App Bundle → AAB → upload to Play Console**.

---

## Updating the app

Because `capacitor.config.json` uses `server.url = https://getsafetea.app`, **a normal Vercel deploy updates the mobile app on next cold start.** You only need to ship a new native binary when:
- You add or update a native plugin
- You change permissions or capabilities
- You update the icon, splash, or app name
- Apple/Google bump required SDK versions

Target cadence for binary updates: once per quarter unless triggered.

---

## App Store review notes (copy/paste into App Review Information)

> SafeTea is a hybrid native app built with Capacitor 7 on the iOS 26 SDK. Native features include: camera access for Didit identity verification (liveness + document scan), push notifications via APNs for safety alerts and community replies, native share sheet for sharing warnings, geolocation for city-based safety feeds, and haptic feedback on critical alerts. The web UI layer is the same interface shipped to getsafetea.app to guarantee parity across platforms. No tracking, no ads, no data sold.
>
> Test account: [add before submission]
> Didit sandbox flow: [add before submission]

This framing is designed to clear Apple guideline 4.2 ("minimum functionality") by explicitly listing native-only features.

---

## Environment / toolchain pins (ITMS-90725)

| Tool | Minimum | Reason |
|---|---|---|
| Xcode | **26.0** | Apple ITMS-90725 requires iOS 26 SDK by 2026-04-28 |
| iOS Deployment Target | 15.0 | Device coverage ~98% |
| Capacitor | 7.x | iOS 26 SDK support |
| Android Studio | Ladybug+ | Android 15 SDK |
| compileSdk / targetSdk | 35 | Play Console 2026 requirement |
| minSdk | 24 | Android 7.0+ |
| Java | 17 | Gradle 8.5+ |

---

## What happens to the legacy `safetea-mobile/` folder?

**Archive, don't delete.** Move it with:

```bash
git mv safetea-mobile legacy-safetea-mobile-expo
```

Or delete after this shell is in production and the App Store listing has been updated. Keep the old bundle ID reservation for now in case we need to push an emergency update through the old pipeline.

---

## Parity check procedure (run before every store submission)

1. Launch the Capacitor build on a physical iPhone and Android device
2. Cold start → confirm it loads getsafetea.app
3. Walk through: landing, sign up, name check, community feed, Good Guys directory, Didit verification, profile, settings
4. Screenshot each screen
5. Open the same screens on `getsafetea.app` in mobile Safari / Chrome
6. Diff — any non-status-bar difference is a bug
7. Save comparison screenshots to `1-operations/mobile-parity-check-YYYY-MM-DD.md`

---

Built: 2026-04-07 • Branch: `mobile-capacitor` • Replaces: `safetea-mobile/`
