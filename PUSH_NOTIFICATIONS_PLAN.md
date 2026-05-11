# Push Notifications Plan — Real-Time Safety Alerts

> **Status:** Planning. Build 32 ships foreground real-time briefs (refresh on movement when Alessia is open). This document covers Phase 2 — pushing alerts when the app is closed.
>
> **Audience:** Both Mac and Windows Claude sessions, plus the operator. Read before doing any APNs / background-location work.
>
> **Last updated:** 2026-05-11.

---

## What "real-time push when closed" actually requires

Three independent things have to come together:

1. **The push pipe** (server → user's device) — APNs cert, device-token storage, send service
2. **The trigger** (knowing *when* to send) — needs the user's recent position OR an event the user has opted into
3. **The permission story** (Apple App Review) — anything pulling location while the app is closed needs `Always` permission, and Apple grills safety/dating-adjacent apps hard on this

The first is straightforward engineering. The third is where this gets risky given the **4.3(a) appeal still pending**.

---

## Three sub-phases, ranked by cost / effort / Apple risk

### **2a — Push pipe + opt-in proximity reminders** *(safe, ship first)*

**What it gives:** User opens Alessia, says "Watch this area for me tonight" or "Notify me at 9 PM if I'm still out". Phone fires a local notification when the geofence triggers or the time hits — no background tracking required.

**Components:**
- Device-token registration (`@capacitor/push-notifications` is already in `safetea-capacitor/ios/App/Podfile.lock`)
- New backend table `device_tokens(user_id, token, platform, last_seen)` + endpoints `POST /api/push/register`, `POST /api/push/unregister`
- New backend `services/push/apns.js` using `@parse/node-apn` (free, ~3 deps)
- iOS: APNs auth key (`.p8`) from Apple Developer (free) + Info.plist `aps-environment` already set
- LocalNotifications API for the timer/geofence-triggered fires (no server round-trip)

**Cost:** $0/mo. APNs is free. Tokens stored in your existing Postgres.
**Effort:** ~4 hours backend + 2 hours iOS wiring + admin UI for triggering test pushes.
**Apple risk:** **Low.** Uses `When In Use` permission (already requested for /safelink). Apple has zero issue with this pattern.
**Frees up:** Daily check-in pushes, admin announcements, "your tether group is active" alerts — many secondary use cases.

### **2b — Active-session geofencing (Pulse-style)**

**What it gives:** User explicitly starts a "Safe Walk" or "Active Session" in Alessia. iOS registers up to 20 geofences for high-pattern-risk zones around the user. Phone fires a local notification when crossing one — even if the app is in background or closed (iOS handles geofences natively).

**Components:**
- `@capacitor/geolocation` already installed (it has region-monitoring on iOS)
- Backend `GET /api/ai/briefs/zones?lat&lng&radius` — returns up to 20 polygon-circles for active-pattern zones
- iOS code: when user starts session, fetch zones, register geofences, listen for entry events → fire LocalNotification
- UX: explicit "Start Active Session" button. Session ends after 4 hours or manual end.

**Cost:** $0/mo.
**Effort:** ~6-8 hours (geofence math + iOS native bridge for region events that Capacitor doesn't expose by default — likely needs a small Swift addition to `RebrandBridge`).
**Apple risk:** **Low–Medium.** Geofencing with `When In Use` is fine; user explicitly starts the session, the notification is local, no continuous tracking. Apple actually approves this pattern (it's how Apple Maps "remind me when I leave" works).

### **2c — Always-on passive background tracking** *(defer)*

**What it gives:** Phone reports its location to your backend continuously, even when Alessia is closed. Server evaluates against pattern zones every minute, pushes when a match fires. The "real real-time" experience.

**Components:**
- `Always` location permission (the one Apple scrutinizes hardest)
- Background location updates via Capacitor Geolocation + iOS `allowsBackgroundLocationUpdates`
- Backend job that ingests position updates and evaluates against pattern zones
- Battery management: significant location duty cycling needed, or you'll drain users' phones
- Privacy story: opt-in, transparency UI ("here's everywhere we've seen you"), data retention policy, deletion endpoint

**Cost:** $0/mo on infra. **High** in engineering time.
**Effort:** ~2-3 days of work + thorough testing + privacy policy update + onboarding consent screen + Apple review prep document explaining why a safety app needs Always.
**Apple risk:** **High right now.** Adding `Always` location to an app that's already failing 4.3(a) classification (Apple thinks it's a dating app) makes the appeal harder, not easier. Apple's reviewer will see "dating app + always location" and that's a worse pitch than "safety utility + always location."
**Recommend deferring** until 4.3(a) is appealed and approved. Once recategorized as a safety utility, this becomes a much easier pitch — same lane as Citizen, Life360, etc.

---

## Recommended ordering

1. **Build 33 — ship 2a** (push pipe). Unlocks the entire push surface with zero Apple risk.
2. **Build 34 — ship 2b** (active-session geofencing). Real safety value via geofence-triggered local notifications.
3. **Build N+ — defer 2c** until 4.3(a) appeal lands and the app is confidently classified as a safety utility.

---

## What the Android PC needs to know

The push infra in 2a is **shared** — the backend endpoints (`/api/push/register`, `/api/push/unregister`, the device-tokens table) work identically for FCM (Android) and APNs (iOS). The `services/push/apns.js` becomes `services/push/index.js` with platform branching.

When 2a ships, the Android PC should:
1. Add `@react-native-firebase/messaging` (or the Capacitor equivalent if Android also moves to Capacitor) for FCM tokens
2. Call `POST /api/push/register` with the FCM token + `platform: 'android'`
3. Handle incoming FCM payloads with the standard structure documented in 2a's commit

For 2b, geofencing API differs by platform but the brief-zones endpoint is shared.

For 2c, defer for the same reason on Android — Play Store also scrutinizes background location these days.

---

## Decision points the operator must answer before 2a starts

1. **APNs auth key** — already generated in Apple Developer Console, or do we need to generate one? (3-min task: Apple Developer → Keys → "+" → APNs → download `.p8`. Upload to Vercel as `APNS_AUTH_KEY` (file contents) + `APNS_KEY_ID` + `APNS_TEAM_ID` env vars.)
2. **First push to fire** — recommendation: a daily evening "Alessia briefing" push at 8 PM local time (calls `/api/ai/briefs` for the user's last known coords, summarizes top 1-2 briefs as a notification). Other options: tether activity, admin announcements, scheduled check-ins.
3. **2a + 2b together** in one build, or 2a alone first to validate the pipe? Together is more work but ships the actual user-visible feature faster.
4. **Confirm 2c is deferred** until 4.3(a) appeal lands.

---

## Files / modules that will land when each phase ships

### 2a
- `api/push/register.js`, `api/push/unregister.js`
- `api/migrate-push-tokens.js`
- `services/push/apns.js` (or `index.js` with platform branching when 2a Android joins)
- `safetea-capacitor/www/alessia.html` — register for push on chat-screen open
- `RebrandBridgeViewController.swift` — small native hook to register for remote notifications
- Admin UI card under Settings → "Push Notifications Diagnostics" (test push button)
- New env vars in Vercel: `APNS_AUTH_KEY`, `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_BUNDLE_ID=app.linkher.mobile`, `APNS_PRODUCTION=true|false`

### 2b
- `api/ai/briefs/zones.js`
- Native Swift in `RebrandBridge` — `CLLocationManager` region monitoring, `UNUserNotificationCenter` for local fires
- `safetea-capacitor/www/alessia.html` — "Start Safe Walk Session" button + zone-fetch logic

### 2c
- `api/push/positions.js` (ingest stream)
- `api/cron/evaluate-positions.js` (every 1 min, evaluates active users)
- `services/push/zone-eval.js` (matches positions against pattern zones)
- iOS background location consent + transparency UI screens
- Privacy policy update for Always location

---

## Cost summary

| Phase | Infra cost | Engineering | Apple risk |
|---|---|---|---|
| 2a | $0/mo | 6 hrs | Low |
| 2b | $0/mo | 6-8 hrs | Low-Medium |
| 2c | $0/mo | 2-3 days | High (defer) |

Total to "ship the safe stuff": **~12-14 hrs** of focused work, $0 infra cost.

— end —
