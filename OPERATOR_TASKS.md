# Operator Tasks

Every action required outside of code to fully activate the work shipped this
session. Work through the checklist top to bottom. Each item is independent
unless noted.

---

## Section A — Vercel environment variables

Set these in the Vercel dashboard: **Project -> Settings -> Environment
Variables**. Add to all three scopes (Production, Preview, Development) unless
otherwise noted. Redeploy after adding so the running build picks them up.

- [ ] **`SENTRY_DSN`** — error monitoring (backend API + browser frontend).
  - Where to get it: sign up at https://sentry.io (free tier is fine), create
    a new project. Pick "Node.js" if Sentry asks (the backend uses the Node
    SDK); the same DSN URL is reused for the JavaScript Browser SDK on the
    frontend, so one DSN covers both surfaces.
  - Value format: full URL, e.g.
    `https://abc123@o123456.ingest.sentry.io/7891011`.
  - Unlocks: `/api/*` exceptions in Sentry, browser console errors on every
    page that loads `/js/sentry.js`, and the `window.__safeteaSentry()` self-
    check.

- [ ] **`APNS_KEY_ID`** — iOS push notifications.
  - Apple Developer Portal -> Certificates, IDs & Profiles -> Keys -> "+" ->
    tick "Apple Push Notifications service (APNs)" -> Continue -> Register.
  - Value: the 10-character key ID (e.g. `ABC123DEF4`).

- [ ] **`APNS_TEAM_ID`** — iOS push notifications.
  - Apple Developer Portal -> Membership tab -> Team ID (10 characters).

- [ ] **`APNS_BUNDLE_ID`** — iOS push notifications.
  - Value: `app.linkher.mobile`.

- [ ] **`APNS_PRIVATE_KEY`** — iOS push notifications.
  - When you create the APNs key in the step above, Apple gives you a single
    download of an `.p8` file. **Download it immediately — it is only
    available once.**
  - Open the `.p8` in a text editor and copy the full PEM contents, including
    the `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines.
    Paste as a single env var value. Vercel preserves the newlines.

- [ ] **`APNS_PRODUCTION`** — iOS push notifications, environment flag.
  - Value: `true` for production (App Store / TestFlight builds), `false` for
    sandbox (Xcode debug builds). Set to `true` for the Vercel production
    environment.

- [ ] **`FCM_SERVICE_ACCOUNT_JSON`** — Android push notifications via Firebase
  Cloud Messaging.
  - Firebase Console -> Project Settings (gear icon) -> Service Accounts ->
    Generate new private key -> download the JSON file.
  - Open the JSON file in a text editor and paste the entire contents
    (including the curly braces and the multi-line `private_key` field) as a
    single env var value. Do **not** escape the `\n` newlines in
    `private_key` — Vercel preserves them automatically.

Once all of the above are saved, **redeploy** (Vercel dashboard ->
Deployments -> latest -> "..." -> Redeploy) so the running serverless
functions pick up the new values.

---

## Section B — Vercel dashboard toggles (one-click)

- [ ] **Enable Vercel Web Analytics.**
  - Vercel project -> **Analytics** tab -> **Enable Web Analytics**.
  - Free on Hobby and Pro plans. Data starts flowing on the next deploy.
  - The pixel is already wired into every HTML page in `public/` that loads
    `sentry.js`, so no further code is required.

- [ ] **Verify cron schedules.**
  - Vercel project -> **Settings** -> **Cron Jobs**.
  - Confirm the schedules from `vercel.json` appear in the list (email-drip
    every 30 minutes, process-deletions daily, etc.).
  - If the page shows "no crons" or the count is below what's in
    `vercel.json`, the project's plan does not include enough cron slots.
    **Pro plan is required for more than 2 cron jobs.**

---

## Section C — Twilio 10DLC compliance (required before scaling SMS)

US carriers throttle or block unregistered short codes. Past ~50 SMS/day,
deliverability drops below 80%. Register the campaign before SMS volume
ramps up.

- [ ] Twilio Console -> **Messaging** -> **Regulatory Compliance** -> **10DLC**.
- [ ] **Register the brand** (e.g. "LinkHer Dating LLC" — substitute the
  operator's legal entity name + EIN).
- [ ] **Submit a campaign** with use case **"Account Notification" + "Customer
  Care"**. This covers both onboarding SMS and Pulse alerts.
- [ ] **Cost & timing:**
  - $4 one-time brand registration
  - $10/month campaign fee
  - ~$0.0083/msg (same as before — no per-message price change)
  - 1-2 weeks for carrier approval
- [ ] After approval, retest by completing the onboarding flow once (see
  Section F).

Without this, SMS deliverability will drop below 80% as volume grows.

---

## Section D — Play Console submission (Android vc1035)

The vc1035 build on the Desktop fixes the 16 KB pages warning by setting
`useLegacyPackaging: false`.

- [ ] Open Play Console -> SafeTea app -> Production (or the relevant track)
  -> current release draft.
- [ ] **Remove vc 26 and vc 1034** from the draft.
- [ ] **Upload `safetea-android-2026-05-12-vc1035.aab`** from the Desktop.
- [ ] On the 1,435-device-restriction warning, click **"Proceed anyway"**.
  This is the structural SDK 52 limit and has been click-acknowledged with
  every prior submission.
- [ ] Confirm the **16 KB pages warning is gone** (vc1035 has the
  `useLegacyPackaging: false` fix). If it still appears, stop and re-check
  the AAB.
- [ ] Save -> **Submit for review**.

---

## Section E — App Store screenshots refresh (when convenient)

Current store screenshots are pre-Briefs / pre-Alessia. Refresh both stores
when you have time on-device.

Recommended new shots, in order:

1. **Dashboard hub** with the Trust Score card visible.
2. **Alessia chat surface** with a real reply that mentions a specific tool
   ("Heading out tonight? Try SafeLink...").
3. **Safety Briefs screen** with a Pattern brief showing the FBI NIBRS
   citation.
4. **SafeLink active session** with the SHARING NOW badge.
5. **(Optional)** Subscription management screen with the SafeTea+ tier badge.

Sizes to capture:

- App Store: **6.7" iPhone** + **6.9" iPhone** (Apple now requires both)
- Play Store: **Pixel 8 Pro** at the listed resolution

Use real on-device captures — the authentic system status bar matters.
Avoid scaled simulator output.

---

## Section F — Sanity tests after env vars are set

Quick verifications, one per service. Run after Sections A and B are
complete.

- [ ] **Sentry** — open https://www.getsafetea.app/dashboard.html in any
  browser, open DevTools console, and run:

  ```js
  window.__safeteaSentry()
  ```

  Expect:

  ```json
  { "configured": true, "initialized": true, "dsnPresent": true, "sdkLoaded": true }
  ```

  Any `false` means `SENTRY_DSN` is missing in the environment scope serving
  that deploy.

- [ ] **Push pipe** — with an admin JWT and a user that has a registered
  device token, run:

  ```bash
  curl -X POST https://www.getsafetea.app/api/admin/push-test \
    -H "Authorization: Bearer <ADMIN_JWT>" \
    -H "Content-Type: application/json" \
    -d '{"userId": <id>, "title": "Hello", "body": "Test from operator"}'
  ```

  Expect `{"sent": true, ...}`. The push notification should arrive on the
  target device within 5 seconds. If iOS fails but Android works (or vice
  versa), the relevant credential block in Section A is misconfigured.

- [ ] **Twilio 10DLC** — after carrier approval, complete the onboarding flow
  at https://www.getsafetea.app/onboarding.html and confirm the onboarding
  SMS arrives. Verify carrier delivery in **Twilio Console -> Monitor ->
  Logs -> Messaging**.

- [ ] **Vercel Web Analytics** — after enabling, load any page on the site,
  then go to **Vercel project -> Analytics tab -> "Last 1 hour"** view.
  Confirm the page view appears.
