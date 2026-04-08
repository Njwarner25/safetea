# GitHub Actions Secrets — SafeTea Mobile Build

The `mobile-build.yml` workflow needs **10 repository secrets** to produce
signed iOS + Android builds and auto-upload them to TestFlight and Play
Console Internal Testing.

If a secret is missing, the workflow still runs and produces unsigned build
artifacts you can download from the Actions tab — but TestFlight / Play
Console upload will be skipped.

**Where to add these:** GitHub repo → **Settings → Secrets and variables →
Actions → New repository secret**. Paste exact values, no surrounding quotes.

---

## iOS — 5 secrets

### 1. `APP_STORE_CONNECT_API_KEY_ID`
**What:** 10-character App Store Connect API key ID (e.g., `252FLXAQ6S`).
**How to get it:**
1. Log in at https://appstoreconnect.apple.com
2. **Users and Access → Integrations → App Store Connect API → Team Keys**
3. Click **+** to generate a new key
4. **Access:** select **App Manager** (App Manager is the minimum — not Admin)
5. **Name:** "SafeTea CI"
6. Click **Generate**
7. The Key ID is shown in the table — copy the 10-char string

### 2. `APP_STORE_CONNECT_API_ISSUER_ID`
**What:** UUID issuer ID (e.g., `fa4a4c84-5d8f-4a9f-ba22-d20d31a6ba69`).
**How to get it:** On the same **App Store Connect API** page, the Issuer ID
is shown above the keys table. Copy the full UUID.

### 3. `APP_STORE_CONNECT_API_KEY_CONTENT`
**What:** Base64-encoded contents of the `.p8` file Apple generated.
**How to get it:**
1. Right after generating the key in step 1, click **Download API Key**
2. You can only download it ONCE — Apple will not let you download again
3. Save the file (e.g., `AuthKey_252FLXAQ6S.p8`)
4. Base64-encode the entire `.p8` file (no line wraps):
   - macOS/Linux: `base64 -i AuthKey_252FLXAQ6S.p8 -o AuthKey_252FLXAQ6S.base64.txt`
   - Linux: `base64 -w 0 AuthKey_252FLXAQ6S.p8 > AuthKey_252FLXAQ6S.base64.txt`
   - PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("AuthKey_252FLXAQ6S.p8")) | Set-Content AuthKey_252FLXAQ6S.base64.txt`
5. Open the `.base64.txt` file — it's a single line of base64
6. Copy the entire single line and paste as the secret value

The workflow base64-decodes this back to a PEM file before invoking
`xcodebuild -authenticationKeyPath`.

### 4. `APPLE_TEAM_ID`
**What:** 10-character Apple Developer team ID (e.g., `DZ3NZHNLHX`).
**How to get it:**
1. Log in at https://developer.apple.com/account
2. Click **Membership** (or **Membership Details**)
3. Copy the **Team ID** — 10 alphanumeric chars

### 5. `APPLE_ID`
**What:** The Apple ID email associated with the Apple Developer account
(e.g., `dev@getsafetea.app`). Stored for reference and future altool fallback
flows — the current workflow uses API key auth and does not read this secret
directly, but keeping it set allows quick switching if App Store Connect API
is ever unavailable.

**Sanity check:** with secrets 1–4 set, the iOS job uses Xcode's
`-allowProvisioningUpdates` to automatically create / fetch the distribution
certificate and provisioning profile from Apple. You do **not** need to
manage `.p12` files or `.mobileprovision` files yourself.

---

## Android — 4 secrets

### 6. `ANDROID_KEYSTORE_BASE64`
**What:** Your upload keystore (`.jks` file), base64-encoded.
**How to generate the keystore (one time, save it forever):**
On any machine with `keytool` (comes with JDK):
```bash
keytool -genkey -v \
  -keystore safetea-upload.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias safetea-upload
```
- Set a strong store password — save in 1Password as `Android Keystore Password`
- Set the same as the key password (or different, both go in secrets below)
- Set the alias: `safetea-upload`
- Fill in the certificate info (name, org, city, etc.)

**To base64-encode the .jks for the secret:**
- macOS / Linux: `base64 -i safetea-upload.jks | pbcopy` (copies to clipboard)
- Windows PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("safetea-upload.jks")) | Set-Clipboard`

Paste the base64 blob (one giant line, no whitespace) as the secret value.

**CRITICAL:** Save the original `safetea-upload.jks` somewhere safe forever
(1Password attachment is ideal). If you lose it, you cannot publish updates
to the Play Store under the same `app.getsafetea` package — Google will
require a new package name and a new app listing. **Do not commit it to git.**

### 7. `ANDROID_KEYSTORE_PASSWORD`
**What:** The store password you set during `keytool -genkeypair`.

### 8. `ANDROID_KEY_ALIAS`
**What:** `safetea` (or whatever alias you used in `keytool -genkeypair`).

### 9. `ANDROID_KEY_PASSWORD`
**What:** The key password — usually the same as the store password unless
you set them differently.

---

## Play Console upload — 1 secret (optional but needed for auto-upload)

### 10. `PLAY_SERVICE_ACCOUNT_JSON`
**What:** Google Cloud service account JSON key with **Play Console** access.
**Prereq:** Google Play Console developer account ($25 one-time, ~24h
approval). Without this, Android builds still work — you just can't
auto-upload, you'd download the .aab from the Actions artifacts and upload
manually.

**How to set up the service account:**
1. Open Play Console → **Setup → API access**
2. Click **Choose a Google Cloud project** → create or pick one
3. Click **Create new service account** → opens Google Cloud Console
4. In Cloud Console: **Service Accounts → + Create Service Account**
   - Name: `safetea-play-upload`
   - Role: skip — we'll grant access in Play Console instead
5. After creation, click the service account → **Keys → Add Key → Create
   New Key → JSON** → download the `.json` file
6. Back in Play Console **API access** page → click **Grant access** next
   to the new service account
   - **App permissions:** add SafeTea (`app.getsafetea`)
   - **Account permissions:** check **Release apps to testing tracks**,
     **Release to production**, **Manage testing tracks**
7. Open the downloaded JSON file in any text editor
8. Copy the **entire JSON** (including the curly braces)
9. Paste as the secret value

---

## Verification — first build

After setting the secrets:
1. Go to **Actions → Mobile Build (iOS + Android) → Run workflow** (top-right)
2. Branch: `mobile-capacitor`
3. Upload: `false` (just build, don't upload yet)
4. Click **Run workflow**

The first run takes ~25 min (Xcode + Gradle cold caches). Watch both jobs:
- **iOS job** should reach "Export .ipa" without errors and produce
  `safetea-ios-NNNN` artifact at the bottom of the run
- **Android job** should reach "Build signed release .aab" and produce
  `safetea-android-NNNN` artifact

Download both artifacts. Inspect:
- iOS: the `.ipa` is store-submittable (it's already signed)
- Android: the `.aab` is store-submittable

Then re-run with **Upload: true** (or merge the branch to `main`) to push
to TestFlight + Play Console Internal Testing.

---

## What each secret unlocks

| Secret | Without it |
|---|---|
| `APP_STORE_CONNECT_API_KEY_ID` / `APP_STORE_CONNECT_API_ISSUER_ID` / `APP_STORE_CONNECT_API_KEY_CONTENT` / `APPLE_TEAM_ID` | iOS build runs unsigned, no TestFlight upload |
| `APPLE_ID` | No functional impact on the current workflow — reserved for altool fallback |
| `ANDROID_KEYSTORE_BASE64` / `ANDROID_KEYSTORE_PASSWORD` / `ANDROID_KEY_ALIAS` / `ANDROID_KEY_PASSWORD` | Android job builds unsigned debug `.apk` only — not Play-submittable |
| `PLAY_SERVICE_ACCOUNT_JSON` | Signed `.aab` is built but not auto-uploaded; download from Actions artifacts and upload manually in Play Console |

---

## Rotating a secret

GitHub doesn't show secret values after they're set, only the names. If you
need to rotate (e.g., new ASC API key), just **Update** the secret in the
same UI. The next workflow run picks up the new value.

## Removing secrets

If you ever want to test the unsigned-fallback path, just delete one of the
required secrets in the GitHub Settings UI. The workflow will detect the
gap and downgrade gracefully.

---

## Don't paste these in chat

These secrets are sensitive. **Do not paste them into Claude chat, Slack,
email, or anywhere outside the GitHub Settings UI.** Claude Code in this
repo will never ask for them — only the GitHub Actions runner sees them,
and only at runtime via the encrypted secret store.
