#!/usr/bin/env bash
# Injects signingConfigs.release into android/app/build.gradle so the
# release .aab is signed with the upload keystore. Idempotent — running
# this script twice is a no-op.
#
# Reads keystore.properties at android/keystore.properties (NOT committed,
# generated at build time from CI secrets).

set -euo pipefail

GRADLE="android/app/build.gradle"

if [[ ! -f "$GRADLE" ]]; then
  echo "ERROR: $GRADLE not found. Did 'npx cap add android' run?"
  exit 1
fi

if grep -q "signingConfigs " "$GRADLE"; then
  echo "signingConfigs already present in $GRADLE — skipping injection"
  exit 0
fi

python3 - <<'PY'
import re
from pathlib import Path

p = Path("android/app/build.gradle")
src = p.read_text()

signing_block = '''    signingConfigs {
        release {
            def kp = new Properties()
            def kf = rootProject.file("keystore.properties")
            if (kf.exists()) { kf.withInputStream { kp.load(it) } }
            storeFile file(kp["storeFile"] ?: "upload-keystore.jks")
            storePassword kp["storePassword"]
            keyAlias kp["keyAlias"]
            keyPassword kp["keyPassword"]
        }
    }
'''

# Insert signingConfigs block immediately before buildTypes { ... }
new_src, n = re.subn(
    r'(\n[ \t]*buildTypes[ \t]*\{)',
    '\n' + signing_block + r'\1',
    src,
    count=1,
)
if n == 0:
    raise SystemExit("ERROR: could not find 'buildTypes {' block in build.gradle")

# Wire signingConfig signingConfigs.release inside the existing release{} buildType
new_src, n = re.subn(
    r'(buildTypes[ \t]*\{[\s\S]*?release[ \t]*\{)',
    r'\1\n            signingConfig signingConfigs.release',
    new_src,
    count=1,
)
if n == 0:
    raise SystemExit("ERROR: could not find 'release {' inside buildTypes")

p.write_text(new_src)
print("Injected signingConfigs.release into android/app/build.gradle")
PY

echo "--- After injection ---"
grep -A1 "signingConfig" "$GRADLE" | sed 's/^/  /' || true
