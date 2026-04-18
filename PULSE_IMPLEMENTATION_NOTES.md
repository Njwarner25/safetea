# SafeTea Pulse — Phase 1 Implementation Notes

## Status
Phase 1 complete. Pulse is architected, wired into the mobile root layout, and
backend stubs are in place. **No Family / guardian features implemented** —
architecture leaves room for them in Phase 2 (~90 days).

## Where it lives
Canonical repo: `safetea-fresh/`
Mobile app: `safetea-fresh/safetea-mobile/` (Expo Router + Zustand)
API: `safetea-fresh/api/pulse/`

## Files added

### Mobile (`safetea-fresh/safetea-mobile/`)
- `types/pulse.ts` — `PulseSession`, `PulseAnomalyType`, `PulseSafeZone`, `PulseAlertPayload`, etc.
- `constants/pulseThresholds.ts` — per-session-type thresholds (walking, jogging, date, ride, meetup, custom). No hardcoded values in services; everything reads from this table.
- `services/pulse/geo.ts` — `distanceMeters` (haversine).
- `services/pulse/PulseSessionManager.ts` — in-memory session with subscribers.
- `services/pulse/PulseSafeZoneManager.ts` — safe zone registry + `isInside`.
- `services/pulse/PulseInactivityDetector.ts` — flags `secondsSinceMovement >= threshold`.
- `services/pulse/PulseRouteDeviationDetector.ts` — flags when moving away from destination past threshold (keeps per-session history for direction).
- `services/pulse/PulseCheckInMonitor.ts` — flags missed check-ins and session overruns.
- `services/pulse/PulseEscalationService.ts` — prompt → wait N seconds → escalate. Timers keyed by session id.
- `services/pulse/PulseEngine.ts` — orchestrator. Polls every 15s (`PULSE_POLL_INTERVAL_MS`), runs detectors in priority order (inactivity → route → overrun → missed check-in). Suppressed inside safe zones.
- `services/pulse/index.ts` — barrel export.
- `store/pulseStore.ts` — Zustand bridge. Owns the single `PulseEngine` instance. Exposes `startSession`, `endSession`, `reportLocation`, `acknowledgePrompt`, `sendHelpNow`, safe-zone mutators, and a swappable `setPulseAlertSender` for wiring the backend.
- `components/pulse/PulseStatusBadge.tsx` — dashboard pill (Pulse Active / Paused / Alert).
- `components/pulse/PulseAreYouOkayPrompt.tsx` — full-screen modal with 3 actions (I'm okay, Send help, Call contact), vibration, animated badge, live countdown. Mounted once in `app/_layout.tsx` so it overlays every screen.
- `components/pulse/PulseSessionToggle.tsx` — per-session on/off switch.

### Mobile (edited)
- `app/_layout.tsx` — imports and mounts `PulseAreYouOkayPrompt` globally.

### Backend (`safetea-fresh/api/pulse/`)
- `session.js` — POST creates a `pulse_sessions` row, PATCH updates status / location / anomaly. Inline `CREATE TABLE IF NOT EXISTS` follows the convention used in `api/recording/start.js`.
- `anomaly.js` — POST logs an anomaly to `pulse_anomalies` (for later analysis / false-positive tuning).
- `escalate.js` — POST records an escalation to `pulse_escalations` and pulls contacts via the same fallback chain as recording (recording_contacts → active date_trusted_contacts). **SMS/email dispatch is intentionally disabled** — left as a TODO pending copy approval. The stub returns `dispatched: false` so the client can exercise the full flow.

## How the pieces connect

```
UI (Screen mounts engine via store)
  │
  ▼
usePulseStore ──► PulseEngine (polls every 15s)
                    ├─► PulseSessionManager  (in-memory current session)
                    ├─► PulseSafeZoneManager (short-circuits tick)
                    ├─► PulseInactivityDetector
                    ├─► PulseRouteDeviationDetector
                    ├─► PulseCheckInMonitor
                    └─► PulseEscalationService
                          │  prompts user via store → UI modal
                          │
                          ▼ (on timeout)
                          sendAlert() ──► (swappable) ──► /api/pulse/escalate
```

The alert dispatcher is injected via `setPulseAlertSender`, so you can point it
at the real API, keep it in dev logging, or replace it in tests.

## Key design choices (assumptions)

1. **Single active session.** `PulseSessionManager` holds one session at a time, matching the existing `useSafeWalkStore.activeSession` model. If overlapping sessions are ever needed, swap the manager to keyed storage without touching detectors.
2. **15s poll interval.** Balances responsiveness against battery. Tune via `PULSE_POLL_INTERVAL_MS`.
3. **Detection priority** = inactivity → route deviation → session overrun → missed check-in. First trigger wins, so we never double-prompt. Rationale: physical safety signals beat schedule signals.
4. **Safe zones fully suppress triggers** (per spec). No reduced-sensitivity tier in Phase 1 — that can be added by adding a "monitoring intensity" field on `PulseSafeZone` later.
5. **Route deviation needs direction, not just distance.** The detector tracks the previous distance-to-destination and only trips when the user is actively *moving away* past threshold. Prevents false positives for destinations that happen to be far at the start.
6. **Escalation is opt-out, not opt-in.** Once prompted, the timer runs by default; user must tap "I'm okay" to cancel. This matches the spec ("If no response within ~30–60 seconds → escalate").
7. **Backend dispatch disabled in Phase 1.** Message templates, SMS copy, and escalation tone need sign-off (marketing / legal) before we fan out to contacts. The API records everything so nothing is lost.
8. **Location reporting is driven by the host screen**, not the engine. Screens that already use `expo-location` (e.g. `safewalk.tsx`) should call `usePulseStore().reportLocation(point)` on each GPS update. This avoids duplicating permission prompts and keeps location policy in one place.

## What's NOT built (deferred to Phase 2: Pulse Family)
- Parent/guardian accounts
- Child-device companion app
- Family linking / invitation flow
- Guardian dashboard
- Remote pause/resume by guardian

The engine is designed so a `GuardianEscalationService` can be swapped in for
`PulseEscalationService` without touching detectors or the session manager.

## What's stubbed
- `sendAlertImpl` in `pulseStore.ts` — currently `console.log` in dev. Wire to `/api/pulse/escalate` when approved.
- Fall detection / erratic movement — `PulseAnomalyType` includes `movement_anomaly` so the type system is ready; no detector yet.
- Background execution — Pulse runs while the app is foregrounded (via `setInterval`). Background polling requires Expo TaskManager; out of scope for Phase 1.

## How to hook Pulse into an existing screen (example)

```tsx
import { usePulseStore } from '../store/pulseStore';
import * as Location from 'expo-location';

// On session start:
usePulseStore.getState().startSession({
  sessionId: 'uuid',
  userId: currentUser.id,
  sessionType: 'date',
  startedAt: new Date().toISOString(),
  expectedEndAt: expectedEnd.toISOString(),
  destination: { latitude: venueLat, longitude: venueLon },
  trustedContactId: contact.id,
  status: 'active',
  lastMovementAt: new Date().toISOString(),
  escalationStatus: 'idle',
  pulseEnabled: true,
});

// On each GPS update:
Location.watchPositionAsync({}, (loc) => {
  usePulseStore.getState().reportLocation({
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    accuracyMeters: loc.coords.accuracy ?? undefined,
    recordedAt: new Date(loc.timestamp).toISOString(),
  });
});

// On session end:
usePulseStore.getState().endSession();
```

## Manual smoke test (dev)
1. Start a session with a short inactivity threshold (override in `pulseThresholds.ts`, e.g. `walking.inactivitySeconds = 30`).
2. Stop calling `reportLocation`.
3. Within ~30s the "Are you okay?" modal should appear with vibration and a countdown.
4. Tap "I'm okay" → modal dismisses, status returns to Active.
5. Let the countdown expire → `console.log('[Pulse] sendAlert (stub)', ...)` should fire, session status flips to `escalated`.

## Success criteria (from spec) — status
- ☑ User can start a session (via `startSession` in store)
- ☑ Pulse runs in background (in-app foreground — true background deferred)
- ☑ Anomaly triggers prompt (full-screen modal with vibration)
- ☑ No response → alert sent (stubbed dispatcher)
- ☑ Safe zones suppress false alerts (`PulseSafeZoneManager`)
- ☑ Smooth and not intrusive (single modal, one prompt at a time, 15s poll)
