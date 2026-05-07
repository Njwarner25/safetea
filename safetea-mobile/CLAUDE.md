# safetea-mobile — React Native / Expo (Android-only)

**This directory ships the legacy React Native Android app. iOS does NOT ship from here anymore.**

## What this is

The original SafeTea React Native app built with Expo. Currently the shipping Android binary (`app.getsafetea.mobile`, package signed for Play Store).

iOS used to ship from here too. As of the LinkHer rebrand (PR #40, May 2026), iOS migrated to Capacitor at `../safetea-capacitor-ios/`. **Do not add iOS-specific code, builds, or config to this directory.**

## Strict rules

1. **Do NOT add iOS features, screens, or configuration here.** iOS = `../safetea-capacitor-ios/`.
2. **Do NOT remove the LinkHer-related code** (e.g., `constants/colors.ts:LinkHerDark/LinkHerLight`, iOS rebrand strings). It's still referenced for the Capacitor build pipeline that reuses these assets.
3. **Do NOT redesign existing screens** unless explicitly asked. Bug-fix scope only by default.
4. **Do NOT replace this with a Capacitor Android build** without coordinating with the team — the migration plan is separate work.
5. **The web app at `public/` is the source of truth for design and copy.** When in doubt, mirror the web.

## What you CAN do here

- Bug fixes in existing Android screens (`app/`).
- Bump `versionCode` in `app.json` for new Play Store releases.
- Add Android-only features that explicitly cannot be done via the web/Capacitor route.
- Run typechecks: `cd safetea-mobile && npm install && npx tsc --noEmit`.
- EAS builds: `npx eas build --platform android --profile production`.

## What you should NOT touch from here

- `../safetea-capacitor/` (Android Capacitor wrapper)
- `../safetea-capacitor-ios/` (iOS LinkHer Capacitor wrapper)
- `../public/` (web app — that's the web team's surface)
- `../api/` and `../services/` (backend — only with explicit task scope)

## AI Companion note

A v1 AI Companion feature was built on branch `add-ai-companion` (May 2026). It includes onboarding/chat/settings/journal screens under `app/companion/`, a zustand store, and backend endpoints under `api/ai/`. The branch has practitioner-review concerns that were noted but overridden by the operator. If you find that branch and are asked to extend it, surface the concern once before continuing.
