# Companion / Alessia Safety Briefs — Android Integration

> **What this is:** A self-contained spec for pulling the Alessia Safety Briefs feature into the Android Expo build (`safetea-mobile/`). The backend is already live and shared across web + iOS + Android (single Vercel push deploys to all three). This doc tells the Android-PC session exactly what to call, what to render, and how to keep tone/branding consistent.
>
> **Last updated:** 2026-05-11. Reflects backend at `8c07209` on `main`.

---

## TL;DR

1. Read the API contract below.
2. Add a `safetyBriefsStore` (zustand, mirroring `aiCompanionStore.ts` pattern).
3. Add a `BriefsScreen` to `app/companion/` (or wherever the Android Alessia surface lives).
4. Render brief cards with the SafeTea-branded design tokens. **Do not use LinkHer assets.**
5. Wire action buttons to existing Android screens (`/safelink`, `/date-status`, `/pulse`, etc.).
6. Cite the source (`b.source`) when present.
7. Ship.

---

## Backend (already deployed — do not modify on Android PC)

### Endpoint

```
GET https://getsafetea.app/api/ai/briefs?lat=<f>&lng=<f>&local_hour=<0..23>&dow=<0..6>
Authorization: Bearer <user JWT>
```

| Query param | Required | Notes |
|---|---|---|
| `lat` | yes | float, -90..90 |
| `lng` | yes | float, -180..180 |
| `local_hour` | recommended | 0–23, user's local hour. Drives time-of-day briefs and pattern matching. |
| `dow` | recommended | 0=Sun..6=Sat. Drives weekday/weekend pattern selection. |

### Response

```json
{
  "briefs": [
    {
      "id": "pat-alley-night",
      "type": "PATTERN",
      "icon": "fa-road-bridge",
      "body": "Alessia noticed you're near an alley. FBI data shows incidents in alley and isolated-walkway locations are more concentrated between 8 PM and 2 AM...",
      "severity": "gentle",
      "actions": ["safe_walk", "safer_route", "share_location", "dismiss"],
      "source": "FBI NIBRS"
    },
    {
      "id": "nws-NWS-IDP7-...",
      "type": "WEATHER",
      "icon": "fa-cloud-bolt",
      "body": "Severe Thunderstorm in effect for your area. Consider delaying travel or using a safer indoor pickup location if your plans take you outside.",
      "severity": "severe",
      "actions": ["dismiss"]
    },
    {
      "id": "tod-night",
      "type": "NIGHTTIME",
      "icon": "fa-moon",
      "body": "It's getting late. If your route takes you somewhere less populated, you may want to start a Safe Walk session or share your live location with a trusted contact.",
      "severity": "gentle",
      "actions": ["safe_walk", "share_location", "dismiss"]
    }
  ]
}
```

### Brief `type` values

| `type` | Meaning | Sub-line to render |
|---|---|---|
| `PATTERN` | Statistical context from FBI NIBRS / BJS NCVS | `Source: ${b.source}` (always present) |
| `WEATHER` | Live NWS alert | `Recent activity` |
| `NIGHTTIME` | Time-of-day awareness | `Recent activity` |
| `TRANSIT` / `AREA` / etc. | Future hyperlocal sources | `Recent activity` |

### Brief `actions`

Each `actions` entry is one of: `share_location`, `check_in`, `safer_route`, `notify_contact`, `safe_walk`, `dismiss`. Render as chips/buttons. The first non-`dismiss` action with `severity: 'severe'` may be styled primary; otherwise render them all as ghost chips. Wire each to its existing route:

| Action | Android destination |
|---|---|
| `share_location` | `router.push('/safelink')` |
| `check_in` | `router.push('/date-status')` (or the equivalent) |
| `safer_route` | `Linking.openURL('https://maps.google.com/?dirflg=w')` or Apple Maps fallback |
| `notify_contact` | open trusted-contact picker (existing or stub) |
| `safe_walk` | `router.push('/pulse')` or `/safewalk` |
| `dismiss` | local state only — remove from the list |

### Error states

| Status | Meaning | What to show |
|---|---|---|
| 200 + `briefs: []` | No signals matched — user is in a quiet area | Empty state: "All caught up. Alessia will let you know if anything needs your attention." |
| 401 | User token expired | Re-auth flow |
| 400 | Missing/invalid `lat`/`lng` | Show empty state — don't surface a technical error |
| 500 | Backend assembly failed | Fall back to local cached briefs if any; else empty state |

---

## Suggested Android implementation

### 1. Store (`safetea-mobile/store/safetyBriefsStore.ts`)

Mirrors the existing `aiCompanionStore.ts` pattern. Zustand + AsyncStorage cache for offline display, but always refetches on screen focus.

```ts
import { create } from 'zustand';
import * as Location from 'expo-location';
import { API_BASE } from '../constants/api';
import { useAuthStore } from './authStore';

export type Brief = {
  id: string;
  type: 'PATTERN' | 'WEATHER' | 'NIGHTTIME' | string;
  icon: string;
  body: string;
  severity: 'gentle' | 'severe' | string;
  actions: string[];
  source?: string;
};

type BriefsState = {
  briefs: Brief[];
  loading: boolean;
  error: string | null;
  load: () => Promise<void>;
  dismiss: (id: string) => void;
};

export const useBriefsStore = create<BriefsState>((set, get) => ({
  briefs: [],
  loading: false,
  error: null,
  load: async () => {
    set({ loading: true, error: null });
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        set({ briefs: [], loading: false });
        return;
      }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const now = new Date();
      const url = `${API_BASE}/api/ai/briefs?lat=${pos.coords.latitude}&lng=${pos.coords.longitude}&local_hour=${now.getHours()}&dow=${now.getDay()}`;
      const token = useAuthStore.getState().token;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error(`briefs ${res.status}`);
      const data = await res.json();
      set({ briefs: data.briefs ?? [], loading: false });
    } catch (e: any) {
      set({ loading: false, error: e?.message ?? 'briefs failed' });
    }
  },
  dismiss: (id) => set((s) => ({ briefs: s.briefs.filter((b) => b.id !== id) })),
}));
```

### 2. Screen (`safetea-mobile/app/companion/briefs.tsx`)

```tsx
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { FontAwesome5 } from '@expo/vector-icons';
import { useEffect } from 'react';
import { useRouter } from 'expo-router';
import { Colors, FontSize, Spacing, BorderRadius } from '../../constants/colors';
import { useBriefsStore, Brief } from '../../store/safetyBriefsStore';

const ACTION_DESTS: Record<string, () => void> = { /* see Action table above */ };

export default function BriefsScreen() {
  const router = useRouter();
  const { briefs, loading, load, dismiss } = useBriefsStore();
  useEffect(() => { load(); }, []);

  return (
    <ScrollView style={{ flex: 1, backgroundColor: Colors.background }}>
      {/* SafeTea-branded header — DO NOT use LinkHer text/assets */}
      <View style={{ padding: Spacing.lg }}>
        <Text style={{ color: Colors.coral, fontSize: 11, fontWeight: '800', letterSpacing: 1.2, textTransform: 'uppercase' }}>Safety Briefs</Text>
        <Text style={{ color: Colors.text, fontSize: 22, fontWeight: '800', marginTop: 4 }}>Alessia has a few notes for you</Text>
      </View>

      {briefs.map((b) => (
        <View key={b.id} style={styles.card}>
          <View style={styles.head}>
            <View style={styles.icon}><FontAwesome5 name={faName(b.icon)} color={Colors.coral} size={14} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.type}>{b.type}</Text>
              <Text style={styles.subline}>{b.source ? `Source: ${b.source}` : 'Recent activity'}</Text>
            </View>
            <Pressable onPress={() => dismiss(b.id)}><FontAwesome5 name="times" color={Colors.textMuted} size={14} /></Pressable>
          </View>
          <Text style={styles.body}>{b.body}</Text>
          <View style={styles.actions}>
            {b.actions.map((a) => (
              <Pressable key={a} style={styles.action} onPress={() => handleAction(a, dismiss, b.id, router)}>
                <Text style={styles.actionLabel}>{actionLabel(a)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ))}

      {!loading && briefs.length === 0 && (
        <View style={styles.empty}>
          <FontAwesome5 name="shield-alt" size={28} color={Colors.coral} />
          <Text style={styles.emptyText}>All caught up. Alessia will let you know if anything needs your attention.</Text>
        </View>
      )}
    </ScrollView>
  );
}

// Map FontAwesome 6 icon names from the API to FontAwesome 5 names available in @expo/vector-icons
function faName(api: string): any {
  const map: Record<string, string> = {
    'fa-cloud-bolt': 'cloud-showers-heavy',
    'fa-road-bridge': 'road',
    'fa-square-parking': 'parking',
    'fa-train-subway': 'subway',
    'fa-tree': 'tree',
    'fa-martini-glass': 'glass-martini-alt',
    'fa-house': 'home',
    'fa-shield-halved': 'shield-alt',
    'fa-moon': 'moon',
    'fa-car': 'car',
    'fa-people-group': 'users',
    'fa-route': 'route',
    'fa-location-dot': 'map-marker-alt',
  };
  return map[api] || 'shield-alt';
}

function actionLabel(a: string): string {
  return ({
    share_location: 'Share Location',
    check_in: 'Start Check-In',
    safer_route: 'Safer Route',
    notify_contact: 'Notify Contact',
    safe_walk: 'Start Safe Walk',
    dismiss: 'Dismiss',
  } as Record<string,string>)[a] || a;
}

function handleAction(a: string, dismiss: (id:string)=>void, id: string, router: any) {
  if (a === 'dismiss') return dismiss(id);
  if (a === 'share_location') return router.push('/safelink');
  if (a === 'check_in') return router.push('/date-status');
  if (a === 'safe_walk') return router.push('/pulse');
  if (a === 'safer_route') return /* Linking */ null;
}

const styles = StyleSheet.create({ /* ...SafeTea theme — see existing companion screens for reference */ });
```

### 3. Entry point

Add a header icon (shield) in `app/companion/index.tsx` (the Android Alessia chat) that opens the Briefs screen. A small pink dot indicator if briefs are unread is a nice touch but optional for v1.

---

## Branding rules (important — keep these straight)

- **Android = SafeTea brand.** Use existing `Colors`, `APP_NAME`, and `APP_NAME_PLUS` constants from `safetea-mobile/constants/colors.ts`.
- **Do not import any LinkHer assets** (`alessia-*.png`, neon LinkHer logo, etc.). Those are iOS-only.
- The body text of each brief from the API is brand-neutral (it says "Alessia", not "LinkHer Alessia" or "SafeTea Alessia"). Render it verbatim.
- The header should say "SafeTea" branding consistent with the rest of the Android app.

---

## What's free vs. paid (heads-up if expanding scope later)

| Layer | Cost | Status | Notes |
|---|---|---|---|
| NWS weather alerts | Free | Live, US-wide | api.weather.gov, no key |
| OSM Overpass place context | Free | Live, global | Fair-use only, 30-day cached |
| FBI NIBRS / BJS NCVS pattern table | Free | Live, US patterns | Hand-curated; refresh annually from FBI CDE |
| Community-reported incidents | Free | Stubbed | Needs `safety_briefs` DB table + reporting UI |
| Crime-adapter slot (SpotCrime / Crimeometer) | $50–200/mo | Env-gated stub | Activate by setting `SPOTCRIME_API_KEY` or `CRIMEOMETER_API_KEY` in Vercel env |

If/when the founder funds the paid crime adapter, **no Android changes are required** — the same endpoint will return additional briefs in the same shape.

---

## Tone rules (must be enforced if you ever generate brief content client-side)

The API is the canonical source of brief text. If the Android client ever generates fallback briefs (e.g., when offline), the rules are:

**Use:** "reported incidents", "recent activity", "consider staying alert", "if possible", "Alessia noticed", "you may want to"

**Never use:** "You are in danger", "This area is unsafe", "Do not go here", "Crime is likely", "You may be attacked"

The point of Alessia is to be a *calm protector*, not a *fear engine*.

---

## Smoke-test

After integration, hit these specific lat/lngs to verify variety in responses:

| Coord | Place | Expect |
|---|---|---|
| `34.0522, -118.2437` @ `local_hour=21` | LA downtown evening | NWS-if-active + nightlife/transit pattern brief |
| `40.7128, -74.0060` @ `local_hour=23` | NYC late-night | Transit/nightlife pattern + time-of-day brief |
| `41.8781, -87.6298` @ `local_hour=14` | Chicago midday | Possibly residential burglary pattern (weekday only) |
| `19.4326, -99.1332` @ `local_hour=21` | Mexico City | NWS skipped (non-US), but OSM context + pattern briefs still apply |

---

## Future hooks the Android session can ignore for v1

- The endpoint may add a `cached: true` flag when serving from the 5-min in-memory cache. Safe to ignore.
- The `severity` field is currently `gentle` or `severe`. Future values will be `info` and `urgent`. Code defensively (treat unknown as `gentle`).
- Push notifications: a future v2 will let users opt into push-delivered briefs. Will be a separate `/api/ai/briefs/subscribe` endpoint plus FCM/APNs wiring. Not in scope for this PC.

— end —
