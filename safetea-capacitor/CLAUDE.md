# safetea-capacitor — Android SafeTea Capacitor shell

**This directory ships ONLY the Android SafeTea build. Do not touch it for iOS or web work.**

## What this is

A Capacitor wrapper that loads `https://getsafetea.app` in a native Android WebView and packages it as the SafeTea Android app. App identity is `app.getsafetea` / `SafeTea`.

## Strict rules

1. **Do NOT change `appId` or `appName`.** They are `app.getsafetea` / `SafeTea` and match Play Store signing. iOS LinkHer has its own dir at `../safetea-capacitor-ios/`.
2. **Do NOT add iOS-only config here.** No `ios:` block. Use `../safetea-capacitor-ios/`.
3. **Do NOT redesign or rebuild screens.** Web (`public/`) is the source of truth.
4. **Do NOT add React Native code here.** Capacitor only.
5. **Do NOT touch `../safetea-capacitor-ios/`** or `../safetea-mobile/` from an Android task.

## What you CAN do here

- Edit `capacitor.config.json` for Android-specific Capacitor settings.
- Bump `package.json` version on new Play Store releases.
- Add Android-only Capacitor plugins to `dependencies`.

## Build flow (Mac or Linux with Android SDK)

```bash
cd safetea-capacitor
npm install
npx cap add android     # first time only
npx cap sync android    # after any config / web change
npx cap open android    # opens Android Studio
```

Note: the legacy React Native Android app at `../safetea-mobile/` is the current shipping Android binary. This Capacitor Android wrapper is the planned migration target. Don't ship both Play Store builds simultaneously without coordinating package IDs.
