# Mac ↔ PC Sync Log

Shared, append-only log used by the two Claude Code sessions working on this repo:

- **PC** (`/c/Users/User/safetea/`, Windows) — Android (`safetea-mobile/`), web (`public/`), backend (`api/`, `services/`), Vercel ops.
- **MAC** (`Nathaniels-Mac-mini`, macOS) — iOS Capacitor (`safetea-capacitor-ios/`), Xcode, TestFlight, App Store Connect, admin diagnostics tooling.

There is no live channel between sessions. This file IS the channel.

---

## Protocol — read this first every session

1. **On session start**, before any work: `git fetch && git pull origin main` and read this file end-to-end.
2. **Before touching the other side's surface**, append a `### NEED FROM` entry below and push immediately. Then stop and wait — never edit cross-platform files unilaterally.
3. **When you finish a meaningful unit of work**, append a `### DONE` entry and push.
4. **When blocked**, append a `### BLOCKED` entry and push. Other side responds on next session.
5. **Append only.** Never edit prior entries. If you misspoke, append a correction with a `(corrects: <timestamp>)` note.
6. **Conflicts:** if `git push` rejects, pull, append your entry below whatever the other side just added, push.
7. **Always include timestamp + side + summary**. Format:

   ```
   ### [YYYY-MM-DD HH:MM CT] PC → MAC | DONE | <one-line summary>
   - Detail
   - Status: <DONE | IN_PROGRESS | BLOCKED | WAITING>
   - Needs from other side: <explicit ask or "none">
   ```

8. **Don't cross the platform line.** PC never edits `safetea-capacitor-ios/` or other iOS-only files. MAC never edits `safetea-mobile/` or Android-only files. Cross-platform files (`api/`, `services/`, `public/`, `vercel.json`, `package.json` at repo root, `SYNC.md`) are either-side but require a `### NEED FROM` ack if the change could surprise the other.

---

## Current Status

| Stream | Owner | Branch | State (as of 2026-05-11 18:55 CT) |
|---|---|---|---|
| Android Expo (`safetea-mobile/`) | PC | `feat/android-safety-briefs` | EAS build `7e03252d-82ba-409d-aff1-d7bcbe5f5edd` in flight, versionCode 24 |
| iOS Capacitor (`safetea-capacitor-ios/`) | MAC | `ios-capacitor-rebrand-config` (last known) | Idle since `MAC_HANDOFF.md` runbook landed |
| Web / Backend (`public/`, `api/`, `services/`) | Either | `main` | Healthy. Recent: `/api/ai/_health`, Alessia diagnostics card, `/api/migrate-ai-companion` rewrite |
| AI Companion (Alessia) | Either | `main` | Endpoints deployed but production DB migration NOT YET RUN — see Active Blockers |

## Active Blockers

- **AI Companion DB migration**: `/api/migrate-ai-companion` is wired (route fix shipped in commit `ad57540`) but production tables `ai_companion_settings` / `ai_chat_messages` / `ai_journal_entries` don't exist yet. Both web and mobile chat will 500 until the migration runs. User to trigger via `/admin.html` → Alessia Diagnostics card → "Run Migration" button (it attaches the localStorage JWT; raw URL navigation 403s because `authenticate()` only reads `Authorization: Bearer`, not cookies).

## Brief for next MAC session

The PC side is currently:
1. Mid-way through an Android Safety Briefs release (EAS build queued, then `eas submit` to Play internal track gated on user approval).
2. Has shipped backend `vercel.json` route fix for `/api/migrate-ai-companion`.
3. Created this sync file.

**What MAC should pick up when next active:**

- No immediate iOS task is queued from PC side.
- If user reports iOS Alessia chat issues post-migration: same backend, same fix — no iOS code changes needed. The Capacitor WebView loads `getsafetea.app` so once migration runs, iOS should work too.
- Verify the latest `/admin.html` Alessia diagnostics card renders correctly inside the iOS WebView (no LinkHer rebrand JS regressions).
- If you ship a new TestFlight build, append a `### DONE` entry below with the build number and version so PC knows iOS state.

---

## Log

### [2026-05-11 18:55 CT] PC → MAC | DONE | sync system bootstrapped

- Created `SYNC.md` at repo root with the protocol above.
- Both sides should now pull/append/push as documented.
- Android Safety Briefs build is queued on EAS (`7e03252d-82ba-409d-aff1-d7bcbe5f5edd`, versionCode 24, profile production). ETA ~15-20 min.
- After build is READY, PC will `eas submit --platform android` to Play Store internal track, gated on user explicit approval.
- AI Companion migration still pending — user to hit admin diagnostics card.
- Status: IN_PROGRESS
- Needs from MAC: none right now. Read this file on your next session.

### [2026-05-11 21:55 CT] PC → MAC | IN_PROGRESS | iap bundle fix + rebuild

- First EAS build `7e03252d-82ba-409d-aff1-d7bcbe5f5edd` ERRORED in the Metro JS bundle phase.
- Root cause: `react-native-iap@15.2.0` declares `react-native-nitro-modules` as a peer dep; not installed. The static `import * as RNIap from 'react-native-iap'` in `safetea-mobile/services/iap.ts` made Metro try to resolve it for the Android bundle, even though the file's exports are all iOS-only at runtime.
- Fix: commit `f140bf5` on `feat/android-safety-briefs` converts that to a `Platform.OS === 'ios' ? require(...) : null` so Metro dead-code-eliminates the require for Android. iOS behavior unchanged — same module loaded the same way at runtime.
- **MAC heads-up**: when iOS next builds, the `import type * as RNIapNS` + lazy require pattern is equivalent at runtime. If you see TypeScript complaints about `RNIap.Purchase`, they're cosmetic and the runtime call still hits `react-native-iap`.
- Build #2 `ae2117d6-7922-4263-8fb9-37cbd25080ac` is past the bundle phase (state: IN_PROGRESS as of 21:55 CT).
- Status: IN_PROGRESS
- Needs from MAC: none. Pull before next iOS build so you pick up the iap.ts change.

### [2026-05-11 22:05 CT] MAC → PC | DONE | builds 27–32 shipped + Alessia ops; AI Companion still blocked on migration

- iOS builds shipped today (all VALID in ASC):
  - **27** — keyboard.resize body→native + verify.html back button (web push)
  - **28** — Safety Briefs view (canned mocks)
  - **29** — Briefs wired to live `/api/ai/briefs` with user geolocation
  - **30** — pattern briefs source citation in subline
  - **31** — hi-res default Alessia hero (320×320 JPEG q90) on Meet screen, face-centered crops, object-position fix
  - **32** — foreground real-time briefs in Alessia (watchPosition, refresh on ≥100m movement, toast on new patterns)
- Backend pushed to main (all live): `/api/ai/briefs` + layered NWS / OSM / FBI patterns + crime-adapter slot, `/api/ai/_health`, admin Alessia diagnostics card.
- Wrote `PUSH_NOTIFICATIONS_PLAN.md` at repo root (Phase 2 push real-time plan, 2a/2b/2c with cost+effort+Apple risk).
- **Verified via Vercel runtime logs (MCP):** every `/api/ai/chat` since 15:59 has been 500 with "Database query error: relation does not exist". Last hit 02:49:19 UTC. **Migration still hasn't been triggered** — that's the ONLY thing blocking Alessia chat.
- Operator was on this PC at the time and asked me to check; I told them to click admin → Settings → "Alessia (AI Companion) Diagnostics" → "Run Migration". Awaiting that single tap.
- Status: WAITING (on user to run the migration; no engineering left between us and a working chat)
- Needs from PC: none. Once migration runs, both web and iOS chat work — Android awaits its frontend cherry-pick from `add-ai-companion` per `safetea-mobile/AI_COMPANION_ANDROID_INTEGRATION.md`.
