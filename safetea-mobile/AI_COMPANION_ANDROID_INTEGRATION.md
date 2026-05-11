# Android — AI Companion (Alessia) Integration

> **What this is:** A self-contained spec for landing the Alessia AI Companion on the Android Expo build (`safetea-mobile/`). The backend is already live on `getsafetea.app` and shared across all three platforms — your job is the Android frontend, which already exists in draft form on the `add-ai-companion` branch.
>
> **Last updated:** 2026-05-11. Reflects backend at `3a99296` on `main`.
>
> **Related Docs:** Companion Safety Briefs (separate feature) — `safetea-mobile/COMPANION_BRIEFS_INTEGRATION.md`. The Briefs surface lives inside the Alessia chat header.

---

## TL;DR (do these in order)

1. `git pull origin main`
2. Cherry-pick the four Android Companion screens + store from `origin/add-ai-companion`:
   - `safetea-mobile/app/companion/index.tsx`
   - `safetea-mobile/app/companion/journal.tsx`
   - `safetea-mobile/app/companion/onboarding.tsx`
   - `safetea-mobile/app/companion/settings.tsx`
   - `safetea-mobile/store/aiCompanionStore.ts`
3. Wire a Companion entry point into the Android home/tabs (currently `(tabs)/index.tsx` is just a WebView — add a native Companion tab/route).
4. Verify the migration has been run on prod (see "Verifying state" below).
5. Smoke-test against the live API.
6. Bundle the new Briefs view (per `COMPANION_BRIEFS_INTEGRATION.md`) — opens from the Alessia chat header shield icon.
7. EAS build and submit.

**Strict scope:** SafeTea branding only. Don't import LinkHer assets. Don't push to `main` without confirmation.

---

## Backend (already deployed — do NOT modify)

### Endpoints (all under `https://getsafetea.app/api/ai/`)

| Method | Path | Purpose |
|---|---|---|
| `GET`  | `/api/ai/settings` | Fetch user's companion settings (or null if not onboarded) |
| `PUT`  | `/api/ai/settings` | Upsert settings — body: `{ companion_name, avatar_style, theme_color, tone }` |
| `POST` | `/api/ai/chat` | Send a message — body: `{ message }` → `{ reply, message_id }` |
| `GET`  | `/api/ai/chat?limit=50` | Fetch decrypted chat history → `{ messages: [{ id, role, content, created_at }] }` |
| `POST` | `/api/ai/journal` | Create entry — body: `{ title?, content, mood?, topic?, tags?, is_documentation?, save_to_vault_folder_id? }` |
| `GET`  | `/api/ai/journal?limit=50` | List entries (decrypted) |
| `GET`  | `/api/ai/journal?id=123` | Single entry |
| `DELETE` | `/api/ai/journal?id=123` | Delete |
| `GET`  | `/api/ai/briefs?lat&lng&local_hour&dow` | Safety Briefs (separate doc) |
| `GET`  | `/api/ai/_health` | **Admin-only** diagnostic — see "Verifying state" |

All endpoints require `Authorization: Bearer <jwt>` from the user's logged-in session (`localStorage.getItem('safetea_token')` on web; equivalent in your auth store).

### Server-side enums (must match in Android UI)

```
avatar_style: 'soft_guardian' | 'shield' | 'heart_link' | 'moon_safety' | 'minimal_icon'
theme_color:  'safetea_coral' | 'rose_gold' | 'midnight' | 'soft_lavender'
tone:         'calm' | 'gentle' | 'encouraging' | 'direct'
```

If you send any other string the PUT silently coerces to defaults (`soft_guardian`, `safetea_coral`, `gentle`). Future commits may extend these — don't hard-code that this is the complete list.

### Encryption

Chat messages and journal content/title/tags are AES-encrypted at rest server-side. The Android client sees plaintext both ways — encryption is fully transparent.

### Crisis safety rails

The `services/ai/companion.js` system prompt enforces:
- Never invent crisis hotlines (uses a hard-coded retrieved list — 988, RAINN 800-656-4673, NDVH 800-799-7233, etc.)
- Validate-before-suggest cadence
- No diagnosis / no legal advice / no roleplay
- Short replies on danger signals
- References to in-app SOS / share-location / alert actions

You don't need to replicate any of this in Android — the model output already follows it.

---

## Verifying state (CRITICAL — do this first)

The DB migration may or may not have been run. **Hit the health endpoint** before doing anything else:

From the admin browser session OR with the cron-secret:

```
GET https://getsafetea.app/api/ai/_health
Authorization: Bearer <admin user jwt>
# OR
x-cron-secret: <CRON_SECRET env value>
```

Response:

```json
{
  "ok": true|false,
  "openai_key_set": true,
  "openai_key_source": "AI_COMPANION_OPENAI_KEY",
  "openai_key_prefix": "sk-proj-…AbCd",
  "model": "gpt-4o-mini",
  "companion_isEnabled": true,
  "tables": {
    "ai_companion_settings": true,
    "ai_chat_messages": true,
    "ai_journal_entries": true
  },
  "notes": "Schema OK."
}
```

If `tables.*` are all `false`, the migration hasn't run. The admin user (or anyone with `CRON_SECRET`) needs to run:

```
GET https://getsafetea.app/api/migrate-ai-companion
Authorization: Bearer <admin user jwt>
```

There's also a one-click button in the web admin UI: **getsafetea.app/admin → Settings → "Alessia (AI Companion) Diagnostics" → Run Migration**.

The migration is idempotent (CREATE TABLE IF NOT EXISTS), safe to re-run.

---

## What's already on the `add-ai-companion` branch

The original safetea-mobile screens that built v1 are still there. From the doc commit (Part 5):

```
safetea-mobile/app/companion/index.tsx          — chat UI with theme-tinted bubbles + 4 quick prompts
safetea-mobile/app/companion/journal.tsx        — journaling UI (mood / documentation flag / vault link)
safetea-mobile/app/companion/onboarding.tsx     — naming flow (Ava, Luna, Sage, Haven, Nova, Ally suggestions) + avatar grid + tone radio
safetea-mobile/app/companion/settings.tsx       — edit avatar/theme/tone/name
safetea-mobile/store/aiCompanionStore.ts        — zustand + AsyncStorage; avatar/theme/tone enums + helpers
```

**Cherry-pick approach (recommended):**

```bash
git fetch origin
git checkout main
git checkout origin/add-ai-companion -- \
  safetea-mobile/app/companion \
  safetea-mobile/store/aiCompanionStore.ts
# Review diff, then commit on a branch
git checkout -b android/companion-launch
git add safetea-mobile/app/companion safetea-mobile/store/aiCompanionStore.ts
git commit -m "feat(android): land AI Companion screens from add-ai-companion"
```

Then open a PR — **do NOT push directly to main** without explicit user confirmation.

---

## Wiring the entry point

Currently `safetea-mobile/app/(tabs)/index.tsx` is a single WebView pointing at `getsafetea.app`. You'll want to add a Companion tab (or a button on the WebView toolbar that opens `/companion`).

Suggested minimal change — extend the tab nav to expose Companion:

```tsx
// safetea-mobile/app/(tabs)/_layout.tsx
import { Tabs } from 'expo-router';
import { FontAwesome5 } from '@expo/vector-icons';

export default function TabLayout() {
  return (
    <Tabs screenOptions={{ headerShown: false /* tabBar shown now */ }}>
      <Tabs.Screen name="index" options={{
        title: 'Home',
        tabBarIcon: ({ color }) => <FontAwesome5 name="home" color={color} />,
      }} />
      <Tabs.Screen name="../companion" options={{
        title: 'Alessia',
        tabBarIcon: ({ color }) => <FontAwesome5 name="shield-alt" color={color} />,
      }} />
    </Tabs>
  );
}
```

Or, if you'd rather keep the WebView as the only screen, add a floating action button on the WebView that calls `router.push('/companion')`.

---

## Branding rules (NON-NEGOTIABLE)

- **Android = SafeTea brand.** All UI uses existing `Colors`, `APP_NAME`, and `APP_NAME_PLUS` constants from `safetea-mobile/constants/colors.ts`.
- **Do NOT import any LinkHer assets** (`alessia-*.png`, neon LinkHer logo, `safetea-capacitor/www/assets/alessia/*`). Those are bundled iOS-only.
- The chat history `content` field is already brand-neutral (the model is instructed to say "Alessia" without LinkHer/SafeTea framing). Render it verbatim.
- Onboarding screens may reference "Alessia" by feature name — that's fine, it's a product name, not a brand.

---

## Running migration from Android (optional, future)

You shouldn't need this — the migration runs server-side and only needs to happen once globally. But if a future bootstrap flow needs it (e.g., self-hosted deploy), the call is:

```ts
import { useAuthStore } from '../store/authStore';

await fetch(`${API_BASE}/api/migrate-ai-companion`, {
  headers: { Authorization: `Bearer ${useAuthStore.getState().token}` }
});
```

Returns `{ ok: true, ... }` if the user is admin, otherwise 403.

---

## Smoke-test checklist

After integration, do this against a real (admin or beta) account:

1. **Settings PUT** — From a logged-in account, hit `/api/ai/settings` with PUT and a payload — should return 200 with stored settings.
2. **Settings GET** — Subsequent GET returns the stored row.
3. **Chat POST** — Send `{ message: "hi" }` → should get back `{ reply: "...", message_id: <uuid> }`. Reply should be conversational and brief.
4. **Chat GET history** — List should include the message you just sent.
5. **Journal POST** — Save an entry → 200 with the entry returned.
6. **Journal GET** — Entry should appear at top.

If any of these 500 with "relation does not exist", **the migration hasn't been run** — see "Verifying state" above.

---

## Crisis-line surface (UX requirement)

When the user types content matching crisis keywords ("kill myself", "self-harm", etc.), the model returns text that includes hotline numbers. The Android UI should:

1. Render those numbers as `Linking.openURL('tel:988')` etc. taps.
2. Optionally show a persistent "Get help now" pill at the top of chat once any crisis-keyword has fired in the session.

Spec the user signed off on for iOS: keep it gentle, never alarming. Match the same tone on Android.

---

## Version + EAS

- `safetea-mobile/app.config.ts` `versionCode` is currently 23 (per memory). Bump it for the Android Companion launch build — say to 24.
- EAS build: use the existing `production` profile in `eas.json`. The Apple submit profile is iOS-only; Android submit needs the `google-services.json` service-account key (currently missing — flag to user if you go to submit and it errors).

---

## When you're done

- Take screenshots of the Companion onboarding + chat flow.
- Open a PR from `android/companion-launch` (or whatever branch) — don't push to `main`.
- Tag the user for review.

— end —
