#!/usr/bin/env bash
# Sets versionCode and versionName in android/app/build.gradle.
# Called from CI after `npx cap add android` and before `./gradlew bundleRelease`.
#
# Usage: ./scripts/set-android-version.sh <versionName> <versionCode>

set -euo pipefail

VERSION_NAME="${1:-2.0.0}"
VERSION_CODE="${2:-1}"

GRADLE_FILE="android/app/build.gradle"

if [[ ! -f "$GRADLE_FILE" ]]; then
  echo "ERROR: $GRADLE_FILE not found. Did 'npx cap add android' run?"
  exit 1
fi

# Capacitor 7 generates:
#   versionCode 1
#   versionName "1.0"
# Replace both in place. GNU sed only (CI runs on ubuntu-latest).

sed -i.bak -E "s/versionCode[[:space:]]+[0-9]+/versionCode $VERSION_CODE/" "$GRADLE_FILE"
sed -i.bak -E "s/versionName[[:space:]]+\"[^\"]*\"/versionName \"$VERSION_NAME\"/" "$GRADLE_FILE"
rm -f "$GRADLE_FILE.bak"

echo "Android version set:"
grep -E "applicationId|versionCode|versionName" "$GRADLE_FILE" | sed 's/^/  /'
