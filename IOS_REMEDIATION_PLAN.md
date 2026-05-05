# iOS LinkHer Remediation Plan

**Audience:** A future Claude Code session executing this on the `claude/check-ios-deployment-ju4Qm` branch (or its merge into `main`).

**Repo layout:** monorepo at `~/safetea/`. Three clients all hit the same `api.getsafetea.app` backend:
- `public/` — vanilla JS web app (full feature set, source of truth).
- `safetea-capacitor/` — Capacitor wrapper that loads the web bundle in a WebView. This is what Android SafeTea users get; it inherits every feature from `public/`.
- `safetea-mobile/` — Expo React Native app. This is the **iOS LinkHer** binary. It's a thin native shell that has always lagged behind the web app in feature parity.

## 1. Scope correction — what the rebrand actually changed

The iOS rebrand from SafeTea → LinkHer was **cosmetic** (logos, name, Tea-terminology, Apple-compliance gates on a couple of profile-building features). It did **not** strip features from the iOS app. The features the user notices as "missing on iOS" were never in the React Native app to begin with — they only ever lived in `public/` (and therefore the Android Capacitor wrapper).

**Implication:** "Restoring missing features" is mislabeled. The real work is **bringing the React Native app up to feature parity with the web** so the iOS LinkHer build matches what Android SafeTea users see. Everything in this plan is *new* work in `safetea-mobile/`, not regression repair.

**Two genuinely "removed" features** (PR #40 gates) which the user has now asked to put back:
- **Name Ping** (formerly Name Watch) — gated on iOS via `utils/platform.ts:isProfileBuildingAllowed()`.
- **Background Check** — fully removed from the codebase (commits `b6cb160`, `2af7de0`, `1833121`).

See §3 (Apple compliance) before un-gating Name Ping.

### 1.1 Verification — nothing else was removed during the rebrand

Cross-checked against `git ls-tree -r 1833121 safetea-mobile/app/` (the last commit before PR #40). The pre-rebrand `safetea-mobile/app/` folder contained the same screens that exist today: `(auth)`, `(tabs)`, `fake-call`, `mod/{apply,dashboard}`, `name-alert`, `name-watch`, `post/[id]`, `pulse`, `safelink`, `safety-map`, `safewalk`, `scam-database`, `screening`, `subscription`, `tether`, `vault`. The only files deleted from `safetea-mobile/` since then are:

| Commit | Files deleted | Why |
| --- | --- | --- |
| `2af7de0` | `app/background-check.tsx`, `store/backgroundCheckStore.ts` | Apple 5.1.1(viii) compliance |
| `493ddcc` | `app/name-alert.tsx`, `store/nameWatchStore.ts`, `utils/nameWatchMatcher.ts` | Consolidated duplicate Name Watch + Name Alert into the renamed Name Ping feature |

**Net: zero user-visible features removed by the rebrand other than Background Check.** The "missing on iOS" list in the user's message describes features that never existed in the React Native app — they only ever lived in `public/` and reached Android users via the Capacitor WebView wrapper. The last submitted-to-Apple SafeTea iOS build also shipped without them.

## 2. Tea-terminology cleanup (user-visible iOS strings)

Per the rebrand directive: any "Tea" reference visible to an iOS reviewer must go. Audit complete; full list:

| File | What it says | Action |
| --- | --- | --- |
| `safetea-mobile/types/community.ts:1` | `type MentionCategory = "tea-talk" \| "good-guys"` | Keep the database value `tea-talk` (server-side migration is out of scope) but rename the *type* and any UI usage. Treat `tea-talk` as an internal id only. |
| `safetea-mobile/types/community.ts:25` | `teaTalkCount: number` | Rename field to `[NEWNAME]Count`. |
| `safetea-mobile/components/community/NameFeedIntegration.tsx` (lines 38, 140, 142, 147, 150, 233) | "Tea Talk" UI strings + tab state literal | Replace user-visible `'Tea Talk'` strings with the new feed name. The internal state literal `'tea-talk'` stays (it's the API/db category id). |
| `safetea-mobile/app/screening.tsx` (lines 5, 11, 18, 97, 113, 114, 185–193, 236, 237) | `TeaScoreLevel` type, `teaScore`/`teaScoreLevel` fields, "Tea Score" UI label | Rename type to `SafetyScoreLevel`, fields to `safetyScore`/`safetyScoreLevel`, UI label "Tea Score" → "Safety Score" (or whatever the user picks). |
| `safetea-mobile/store/screeningStore.ts` (lines 3, 22, 23) | Same Tea Score type/fields | Match the rename in `screening.tsx`. |

**Decision required from product:** what to rename the "Tea Talk" feed and "Tea Score" label to. Suggested options (insert chosen names into the table above before executing):

- "Tea Talk" → `Pulse Talk` / `LinkHer Hub` / `Common Ground` / `The Brief` / `Safety Chat`
- "Tea Score" → `Safety Score` / `Trust Score` / `Match Score`

For the rest of this document, the placeholders **`<NEW_FEED_NAME>`** and **`<NEW_SCORE_NAME>`** are used.

## 3. Apple compliance — read before un-gating Name Ping

Apple cited Guideline 5.1.1(viii) ("apps that compile personal information from any source not directly provided by the user for the apparent purpose of profiling, identifying, surveilling, or otherwise tracking individuals are not permitted") in the original SafeTea rejection. The PR #40 response was to gate Name Ping and Background Check on iOS.

**Re-enabling Name Ping on iOS materially raises the risk of another rejection on the same grounds.** The defensible reframing is that the user enters names *they* want to monitor, and matches come from posts *they're already entitled to see in their community feed* — i.e., the app isn't compiling data, it's filtering content the user has access to. If LinkHer goes back to App Review with this feature visible:

- Strengthen the framing in the Name Ping screen copy: emphasise "you choose names to follow", "alerts come from posts in communities you've joined", "we don't search public records or scrape external profiles".
- Be ready to point reviewers at `services/iap.ts`, `utils/namePingMatcher.ts`, and `api/namewatch/index.js` to demonstrate the matching only runs against posts the user already sees.
- Background Check should stay removed — it actually did query public records and would not survive review.

**Required code change to un-gate** (only after the framing is in place):

```diff
// safetea-mobile/utils/platform.ts
- export const isProfileBuildingAllowed = (): boolean => !isIOS();
+ export const isProfileBuildingAllowed = (): boolean => true;
```

This single flip un-gates Name Ping everywhere — the screen check in `app/name-ping.tsx:14-21` and any future tile filter that reads the same helper. **Do not delete the helper** — keep it as the central kill-switch in case Apple pushes back during review and the gate needs to come back fast.

## 4. Critical bug fixes (do these first)

### 4.1 Login crash / "logged in" state never populates

**Symptom:** After SMS login, screens that read `user.role`, `user.tier`, `user.cityId` crash; profile tab shows "Not logged in" even after a successful login.

**Root cause:** `safetea-mobile/app/(auth)/login.tsx:43-50` calls `api.verifyCode()`, gets back `{token}` from the response, calls `api.setToken(token)`, and routes to `/(tabs)`. **It never stores the user object in `useAuthStore`.** The home tab and profile tab read `user` from `useAuthStore`, which is still `null`, so anything that dereferences `user.<field>` without a null check throws.

**Fix:**

1. Add a `getMe()` method to `safetea-mobile/services/api.ts` that hits `GET /api/auth/me` (the endpoint already exists at `api/auth/me.js`).
2. In `safetea-mobile/app/(auth)/login.tsx`, after `api.setToken(data.token)` and before `router.replace('/(tabs)')`, call `api.getMe()` and store the result via `useAuthStore.getState().setUser(user)`.
3. Audit every screen that reads `user.<field>` and add a null-guard or redirect when `user` is `null`. Highest-risk files (none of them currently null-check before dereferencing): `app/(tabs)/index.tsx`, `app/(tabs)/create.tsx`, `app/mod/dashboard.tsx`, `app/screening.tsx`, `app/subscription.tsx`.

**Acceptance criteria:** SMS-based login lands the user on `(tabs)/index` with `useAuthStore.getState().user` populated. The Profile tab shows the avatar, pseudonym, role, tier, and city. Logging out clears the state cleanly.

### 4.2 Alerts tab shows mock data instead of real area alerts

**Symptom:** "Safety Advisory", "AMBER Alert", "Crime Pattern Alert" entries on the Tools tab are fake.

**Root cause:** `safetea-mobile/app/(tabs)/alerts.tsx:6-11` is hardcoded to a `MOCK_ALERTS` array. The `api.getAreaAlerts()` method already exists in `services/api.ts` and the backend endpoints (`api/alerts/area.js`, `api/area-alerts/check.js`, `api/area-alerts/preferences.js`, plus the cron job `api/cron/fetch-crime-alerts.js` that populates them) are live.

**Fix:**

1. Replace the `MOCK_ALERTS` constant with state populated from `api.getAreaAlerts(lat, lon, radius, days)`.
2. Wire location: read the user's city centroid from `useCityStore` (already in the codebase) or request `expo-location` permission and use device GPS.
3. Add pull-to-refresh and a default empty state.
4. Render alert types in priority order: `amber` (AMBER alerts) > `crime-pattern` > `community` > `system`.
5. Tap-through on a community-level alert should route to the post detail (`/post/[id]`) when the alert references a post id.

**Acceptance criteria:** Tools tab shows real alerts from the backend, including the crime-pattern data the cron pulls. Empty city = empty state, not stale mock data.

### 4.3 Admin account creation

**Symptom:** No way to log in as an admin to test moderation.

**Existing surface area:** Backend has `api/admin/create-tester.js` (auth-gated) and `api/create-test-user.js` (unauthenticated, dev-only). The `users.role` column accepts `'admin'`.

**Fix:** Run a one-time SQL update against the production DB to flip an existing user's role to `admin`:

```sql
UPDATE users SET role = 'admin' WHERE phone = '<your phone number>';
```

Or use the `api/admin/setup.js` endpoint if it exposes a bootstrap path (read it first; it may be guarded by an env-var token).

No mobile UI is needed — admin accounts are created out-of-band. Once the `role` is set, logging in via the existing SMS flow lands you in an admin-privileged session and the Profile tab's mod dashboard link becomes visible (`app/(tabs)/profile.tsx:31-33` already conditionalises on `user.role !== 'member'`).

**Acceptance criteria:** A user with `role='admin'` can see and use Mod Dashboard, and any admin-only API endpoints (`api/admin/*`) accept their JWT.

## 5. Feature buildout — bring iOS to parity with web

Each subsection below has the same shape: **what's missing**, **the existing backend surface**, **mobile work to do**, **iOS compliance note (if any)**, **acceptance criteria**, **complexity (S/M/L/XL)**.

> **Complexity guide:** S = a few hours; M = ~1 day; L = 2–4 days; XL = a week+.

### 5.1 Community hub — make "Post" the hub, add `<NEW_FEED_NAME>` (formerly Tea Talk)

**Missing:** The bottom-tab labelled "Post" (`app/(tabs)/create.tsx`) is just a creation form. The community feed lives on the home tab (`index.tsx`) which is also labelled "Community". Users expect a single hub.

**Backend surface:**
- `GET /api/community/index.js` — main feed (returns posts in the user's city, supports category filter).
- `GET /api/community/stats.js` — counts per category including `tea_talk_count`.
- `POST /api/community/post.js` — create a post (also accessible via `api/posts/index.js`).
- `GET /api/posts/[id].js` — post detail, including replies.

**Mobile work:**

1. Restructure tabs: drop the standalone "Post" tab, fold the "+ New Post" action into a floating action button on the Community tab. Or rename "Post" → "Hub" and have it render the same feed UI as `index.tsx` plus a creation FAB.
2. Add the `<NEW_FEED_NAME>` category to the filter row in `app/(tabs)/index.tsx:32-38` (currently only `warning`, `positive`, `question`, `alert`). The internal id stays `'tea-talk'` so it matches the database column value.
3. Update `app/(tabs)/create.tsx:9-14` to allow selecting `<NEW_FEED_NAME>` as a category. Rename the `'tea-talk'` literal in any UI display string to `<NEW_FEED_NAME>` while keeping the API/db value as-is.
4. Replies on `app/post/[id].tsx` are stubbed — add a reply list + composer using `api/replies/index.js` and `api/posts/replies.js`. The web reference is in `public/dashboard.html` (search for `replies`).
5. Make sure `usePostStore` refreshes after create/like/dislike/report so state syncs across tabs.

**iOS compliance:** Posts about specific named individuals are the original 5.1.1(viii) trigger. The web's `tea-talk` category is *general safety chat* and is the safer category to lead with. Make sure category copy on iOS keeps the "general safety discussion, not naming individuals" framing the web's terms.html / guidelines.html already use.

**Acceptance criteria:** Bottom-tab "Post" (or "Hub") renders the full community feed with all five category filters. Creating a post in the new category persists with `category='tea-talk'` and shows back up under the new label.

**Complexity:** M.

### 5.2 Direct Messages

**Missing:** No DM UI. Users can't message each other in the iOS app.

**Backend surface:**
- `GET /api/messages/index.js` — conversation list.
- `GET /api/messages/[userId].js` — thread with a specific user.
- `POST /api/messages/index.js` — send a message (verify shape against the file).

**Mobile work:**

1. Add `getConversations()`, `getMessages(userId)`, `sendMessage(userId, body)` to `services/api.ts`.
2. New screens:
   - `app/messages/index.tsx` — conversation list, sorted by last activity.
   - `app/messages/[userId].tsx` — single thread, message bubbles, send composer.
3. New `useMessagesStore` (zustand) for cached threads + unread count.
4. Add a "Messages" entry to the profile tab menu OR a fifth bottom tab (icon: envelope). Decide based on tab-bar real estate.
5. Push-notification handler in `services/notifications.ts` should route notifications of type `'dm'` to `app/messages/[userId].tsx`.

**iOS compliance:** DMs are user-to-user. Apple requires (Guideline 1.2) a way to **block users**, **report abuse**, and **filter objectionable content**. The reporting flow can reuse `api/posts/report.js`-style infrastructure but needs a `messages.report` analogue. Confirm `api/messages/` already exposes a report endpoint; if not, add one.

**Acceptance criteria:** A user can list conversations, open a thread with another user, send + receive messages, get a push for incoming DMs, and block/report a user from the thread.

**Complexity:** L.

### 5.3 Safety Vault (native build-out)

**Missing:** `app/vault.tsx` is a marketing screen with a CTA that opens `https://www.getsafetea.app/vault` in a browser. On iOS, that CTA is now hidden (commit `b787496`) so vault is effectively inaccessible.

**Backend surface:** Full vault API already exists:
- `api/vault/folders.js` — list/create/rename/delete folders.
- `api/vault/entries.js` — list/create/update/delete entries (text, photo, audio, location).
- `api/vault/contacts.js` — trusted-contact management.
- `api/vault/audit.js` — activity log.
- `api/vault/access-requests.js` — release-on-demand requests.
- `api/vault/exports.js` — downloadable archive.
- `api/vault/integration-settings.js` — auto-encrypt settings.
- `api/vault/stats.js` — counts.
- `api/vault/resources.js` — encryption key bootstrap.
- `api/cron/vault-access-expire.js` — back-end expiry job.

**Mobile work:**

1. Add API client methods in `services/api.ts` for each of the above endpoints.
2. New `useVaultStore` for folders/entries/contacts state.
3. New screens:
   - `app/vault/index.tsx` — folder list (replaces current marketing stub).
   - `app/vault/folder/[id].tsx` — entry list within a folder.
   - `app/vault/entry/[id].tsx` — entry detail.
   - `app/vault/new-entry.tsx` — entry creator (text / photo / audio).
   - `app/vault/contacts.tsx` — trusted contacts manager.
   - `app/vault/release.tsx` — emergency release flow.
4. Photo entries: use `expo-image-picker` to capture/select; upload via `api/photos/upload.js`.
5. Audio entries: use `expo-av` to record; upload via the same photo-upload endpoint with a different mime type, or add an audio-specific endpoint if it doesn't exist.
6. End-to-end encryption: the web app does this in-browser. Use `expo-secure-store` for the key. The encryption scheme has to match the web (read `services/vault/gating.js` and any vault-related code in `public/` to identify the algorithm).
7. Pull-to-refresh, optimistic updates, and offline-cached folder list (last-known state stored in `expo-secure-store`).

**iOS compliance:** The vault is user-content storage — fine under App Store rules. The "release to trusted contact" feature has to be opt-in and revocable (Guideline 5.1.2). The audit log is a positive signal.

**Acceptance criteria:** User can create folders + entries (text/photo/audio), view audit log, manage trusted contacts, trigger an emergency release request, and export an archive — all without leaving the app.

**Complexity:** XL.

### 5.4 Photo Verify

**Missing:** No mobile UI for the photo verification feature.

**Backend surface:**
- `POST /api/photos/upload.js` — uploads a photo, returns a storage url.
- `POST /api/photos/verify.js` — runs the verification check (returns issues, score). Plus paywall logic at lines 369–407 (unauth = $0.99/check, 10-pack $7.99). Sets `tier='plus'` to bypass.
- `POST /api/photos/extract.js` — extracts metadata.
- `POST /api/photos/purchase-check.js` — buy individual checks (Stripe).
- `POST /api/photos/removal-request.js` — DMCA-style removal.

**Mobile work:**

1. Add `verifyPhoto(imageUri)` and related methods to `services/api.ts`.
2. New screen `app/photo-verify.tsx`:
   - Capture or pick an image (`expo-image-picker`).
   - Upload via `api/photos/upload.js`.
   - Call `api/photos/verify.js` and render issues + score.
   - On `tier !== 'plus'`, show paywall: option to upgrade or buy a single check via StoreKit IAP. (Buying single checks via IAP requires a new consumable product in App Store Connect — defer that to a follow-up; for v1, gate behind subscription only.)
3. Add a "Photo Verify" tile to the Tools tab grid in `app/(tabs)/alerts.tsx:13-18`.

**iOS compliance:** Photo manipulation detection is fine. Don't surface the "10-pack consumable" purchase from web pricing — Apple only sees the App Store products. Use `tier === 'plus'` as the only gate on iOS, or set up a corresponding IAP consumable later.

**Acceptance criteria:** A Plus user can verify any photo and see issue list + score in under 10 seconds. A free user is paywalled and offered the LinkHer Plus subscription.

**Complexity:** M.

### 5.5 Conversation Scanner

**Missing:** Apparent gap — the screening screen scans profiles, not chat conversations.

**Backend surface:**
- `POST /api/screening/redflag.js` — analyses arbitrary text for red flags (works for conversation transcripts).
- `POST /api/screening/catfish.js` — catfish detection on profile data; not chat.

Read both files to confirm. The web app's `public/red-flag-scanner.html` is the reference UI.

**Mobile work:**

1. Add `scanConversation(text)` to `services/api.ts` calling `/api/screening/redflag`.
2. New screen `app/conversation-scanner.tsx`:
   - Multi-line input for pasted conversation.
   - "Scan" button → POST → render red-flag list with severity, snippets, recommendations.
   - History list (use `useScreeningStore` or a new `useScannerStore`).
3. Add a "Conversation Scanner" tile to the Tools tab.
4. Consider a "Share to LinkHer" iOS share extension as a follow-up so users can long-press a Messages thread → share to scanner. (Skip for v1 — share extensions are a separate native target and add ~1 day of build config.)

**iOS compliance:** AI analysis of user-provided text is fine. Don't store raw conversation text server-side beyond the scan result; review `api/screening/redflag.js` to confirm.

**Acceptance criteria:** A Plus user can paste conversation text, get a categorised red-flag report, and see scan history.

**Complexity:** S.

### 5.6 Sorority Rooms (private chat groups)

**Missing:** No mobile UI. Web has full implementation.

**Backend surface:** Full Rooms API:
- `api/rooms/{create,join,leave,delete}.js` — room lifecycle.
- `api/rooms/{my-rooms,details,members,settings,regenerate-code}.js` — room metadata.
- `api/rooms/{post,replies,feed,bump,like,pin,report}.js` — room content.

**Mobile work:**

1. API client methods for every endpoint above.
2. New `useRoomsStore` for rooms list, room feed, and currently-joined room.
3. New screens:
   - `app/rooms/index.tsx` — list of rooms the user is in + "Join with code" + "Create room" CTAs.
   - `app/rooms/[id].tsx` — room feed (posts), composer, member count.
   - `app/rooms/[id]/members.tsx` — member list, role badges.
   - `app/rooms/[id]/settings.tsx` — settings (admin/owner only).
   - `app/rooms/join.tsx` — join via 6-digit code.
   - `app/rooms/new.tsx` — create flow.
4. Push notifications for new room posts (use the existing `services/notifications.ts` plumbing, route by message type `'room-post'`).
5. Real-time updates: use polling (e.g. 30s interval on focused room) for v1; consider websockets later.

**iOS compliance:** Same UGC content-moderation requirements as DMs (Guideline 1.2): block, report, filter. The `api/rooms/report.js` and `api/admin/room-reports.js` endpoints already cover the server side. Make sure the native UI surfaces them.

**Acceptance criteria:** A user can create or join a room, post in it, reply, like, see the member list, and (as room owner) regenerate the join code.

**Complexity:** L.

### 5.7 Identity Verification

**Existing surface:** `app/(auth)/verify-identity.tsx` already implements selfie capture + challenge ("hold up two fingers"). API methods `getIdentityChallenge`, `submitIdentityVerification`, `getVerificationStatus` exist in `services/api.ts`.

**Probable gap:** The flow exists but isn't wired into the post-login path, or the result doesn't update `user.is_verified` / `user.role` correctly so the badge never appears on profile and posts.

**Mobile work:**

1. After successful login (per §4.1 fix), if the returned user has `is_verified === false`, route to `verify-identity.tsx` rather than `(tabs)`. Add a "Skip for now" option that lets the user dismiss the prompt; persist the dismissal in `useAuthStore` so we don't badger them every session.
2. After `submitIdentityVerification` succeeds, refresh `user` via `api.getMe()` so the verified badge appears immediately.
3. Add a "Verified" badge to `components/PlusBadge.tsx` or as a separate `VerifiedBadge` next to the pseudonym in the post card and profile header.
4. Backend: `api/admin/request-verify.js` exists for the admin manual-approval flow; verify it returns a state that the mobile UI can poll (`getVerificationStatus`).

**iOS compliance:** Selfie capture is allowed. Make sure the camera permission string in `app.config.ts:54-55` (`NSCameraUsageDescription`) accurately describes the use ("LinkHer uses the camera for identity verification selfies." — already correct).

**Acceptance criteria:** A new user signs up, gets prompted to verify, captures a selfie, and within seconds (auto) or minutes (manual review) sees the verified badge on their profile and on every post they author.

**Complexity:** M.

### 5.8 Moderation system parity

**Existing surface:** `app/mod/dashboard.tsx` and `app/mod/apply.tsx` exist but are minimal — only show the post review queue.

**Web has more:** The web admin (`public/admin.html`) supports:
- AI-task review (`api/admin/ai-tasks.js`, `api/admin/ai-enforce.js`, `api/admin/ai-admin.js`).
- User ban + purge (`api/admin/ban-and-purge.js`, `api/admin/ban-by-user.js`, `api/admin/ban.js`, `api/admin/warn.js`).
- Recent signups + suspicious signups (`api/admin/recent-signups.js`, `api/admin/suspicious-signups.js`).
- Trust events (`api/admin/trust-events.js`, `api/_utils/trust-score.js`).
- Watermark scanning (`api/admin/scan-watermark.js`, `api/admin/watermark-action.js`).
- Room reports (`api/admin/room-reports.js`).
- Org-codes management (`api/admin/org-codes.js`).
- Manual identity verification approval (`api/admin/request-verify.js`).
- Stats dashboard (`api/admin/stats.js`).

**Mobile work:**

1. Expand `app/mod/dashboard.tsx` into a tabbed dashboard (Posts | AI Queue | Bans | Signups | Trust | Watermarks | Stats).
2. Add API client methods for every `api/admin/*` endpoint that's not already covered.
3. Each tab is a standalone screen — keep them small and focused; reuse `app/mod/dashboard.tsx` styles.
4. Strong gate: show the dashboard only if `user.role` is in `['mod', 'senior_mod', 'city_lead', 'admin']`. Already half-implemented at `app/mod/dashboard.tsx:9` — confirm it's correct.

**iOS compliance:** Moderation tooling is fine. The "ban and purge" action should require confirmation (avoid accidental destructive actions per the Apple HIG).

**Acceptance criteria:** An admin can do every moderation action available on the web admin, from the iOS app, without falling back to a browser.

**Complexity:** L.

### 5.9 Logo and asset audit

The build references `assets/icon-linkher.png` and `assets/splash-linkher.png` (1254×1254 + splash). Confirm both exist and are 1024×1024 RGB for App Store submission. Apple will reject builds where the icon isn't exactly 1024×1024 with no alpha channel. Run:

```bash
file safetea-mobile/assets/icon-linkher.png
identify -format "%w x %h %[channels]" safetea-mobile/assets/icon-linkher.png
```

If alpha is present, re-export RGB. PR #40 already did this once but it's worth re-confirming after the bundle id change.

## 6. Recommended implementation order

Do the critical bug fixes first (§4) — they unblock testing of everything else. Then sequence feature work by user-impact:

1. **§4.1 Login crash** — single-line fix per file but must be done first; nothing tests without it.
2. **§4.2 Alerts wired to real API** — small, removes the embarrassing mock data Apple will see.
3. **§4.3 Admin account** — DB SQL update + log in.
4. **§2 Tea-terminology cleanup** — done in one pass once the user picks `<NEW_FEED_NAME>` and `<NEW_SCORE_NAME>`.
5. **§5.1 Community hub restructure** — biggest UX improvement for the buck.
6. **§5.7 Identity verification flow** — already 80% built, just needs wiring.
7. **§5.5 Conversation Scanner** — small, high user value.
8. **§5.4 Photo Verify** — moderate, adds Plus-tier value.
9. **§5.2 Direct Messages** — large but well-understood; pull from any existing chat-UI library if useful.
10. **§5.6 Sorority Rooms** — large; depends on DM patterns being established first.
11. **§5.8 Moderation parity** — admin-facing, can lag user features.
12. **§5.3 Vault** — biggest single buildout; do last unless it's a marketing differentiator.

After each milestone: run `npx tsc --noEmit` from `safetea-mobile/`, fix any new errors, and bump the iOS `buildNumber` in `app.config.ts` before each EAS build.

## 7. Per-task checklist for the executing Claude Code session

For every section in §4 and §5, follow this loop:

1. Read the listed source files.
2. Read the listed backend endpoint(s) to confirm request/response shape.
3. Add/extend API client methods in `safetea-mobile/services/api.ts`.
4. Add/extend the relevant zustand store under `safetea-mobile/store/`.
5. Implement the UI under `safetea-mobile/app/...`.
6. Type-check: `cd safetea-mobile && npx tsc --noEmit`.
7. Smoke test on iOS simulator if possible (`expo run:ios`).
8. Commit with a clear `feat(scope):` or `fix(scope):` message.
9. Update this MD's checklist as items are completed.

## 7.1 Theming — dark mode only, no light mode

The app is locked to dark mode by design. `app.config.ts:81` sets `userInterfaceStyle: 'dark'`, and `constants/useThemeColors.ts` always returns `DarkColors` (the OS color-scheme detection was removed). When adding new screens:

- Import `Colors` directly from `constants/colors.ts` for static styling, or call `useThemeColors()` if the screen needs to consume the palette via a hook.
- **Do not** introduce `useColorScheme()` from `react-native`, light-mode toggles, or any conditional palette logic.
- The `LightColors` / `LinkHerLight` / `SafeTeaLight` exports in `constants/colors.ts` are unused after this change — leave them in place so the file stays diffable, but never import them.

## 8. Out of scope for this plan

- Changing the URL scheme or bundle id again (already done in commits `b787496`).
- Server-side migrations to rename the `tea-talk` post category in the database (cosmetic UI rename only).
- Background Check restoration (will not survive App Review).
- API base URL change from `api.getsafetea.app` to a LinkHer-branded domain (not visible to reviewers under normal review).
- Building a web admin parity for non-iOS-specific admin needs — this plan covers iOS only.
- Re-introducing a light/dark-mode toggle (see §7.1 — dark-only is a product decision, not a limitation).

---

**Last updated:** 2026-05-05.  
**Branch:** `claude/check-ios-deployment-ju4Qm`.  
**Owner of decisions still pending:** product (`<NEW_FEED_NAME>`, `<NEW_SCORE_NAME>`, whether to un-gate Name Ping on iOS).
