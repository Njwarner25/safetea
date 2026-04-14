#!/usr/bin/env bash
# Sets Info.plist usage strings, version, and build number for the iOS app.
# Called from CI after `npx cap add ios` and before `xcodebuild archive`.
#
# Usage: ./scripts/set-ios-metadata.sh <CFBundleShortVersionString> <CFBundleVersion>
#
# All usage description copy is mirrored from the live app behavior at
# https://getsafetea.app — only the strings App Review needs to see, no extras.

set -euo pipefail

VERSION_NAME="${1:-2.0.0}"
BUILD_NUMBER="${2:-1}"

PLIST="ios/App/App/Info.plist"
PB="/usr/libexec/PlistBuddy"

if [[ ! -f "$PLIST" ]]; then
  echo "ERROR: $PLIST not found. Did 'npx cap add ios' run?"
  exit 1
fi

set_string() {
  local key="$1"
  local value="$2"
  $PB -c "Delete :$key" "$PLIST" 2>/dev/null || true
  $PB -c "Add :$key string $value" "$PLIST"
}

# Usage description strings — required by App Review for any app that
# instantiates these APIs even if behind a feature flag on the web.
set_string NSCameraUsageDescription \
  "SafeTea uses your camera for identity verification (Didit liveness check) and to capture photo evidence for community safety warnings."

set_string NSMicrophoneUsageDescription \
  "SafeTea uses your microphone for the Record & Protect safety feature during dates."

set_string NSPhotoLibraryUsageDescription \
  "SafeTea accesses your photo library so you can upload evidence photos when reporting unsafe individuals."

set_string NSPhotoLibraryAddUsageDescription \
  "SafeTea saves verification photos to your library after a successful identity check."

set_string NSLocationWhenInUseUsageDescription \
  "SafeTea uses your location to show city-based safety feeds and to enable SafeWalk live tracking when you start a date check-in."

set_string NSLocationAlwaysAndWhenInUseUsageDescription \
  "SafeTea keeps your SafeWalk check-in active in the background so trusted contacts can see your location until you mark yourself safe."

set_string NSFaceIDUsageDescription \
  "SafeTea uses Face ID to protect access to your verified profile."

# Disable arbitrary loads — we only talk to getsafetea.app over HTTPS.
$PB -c "Delete :NSAppTransportSecurity" "$PLIST" 2>/dev/null || true

# Export compliance — declare we only use standard system HTTPS, which is
# exempt from US export regulations (qualifies under 5D002 b.1 / Note 4).
# Setting this to false in Info.plist removes the "Missing Compliance"
# prompt on every TestFlight upload and lets builds go straight to testers.
# Reference: https://developer.apple.com/documentation/security/complying_with_encryption_export_regulations
$PB -c "Delete :ITSAppUsesNonExemptEncryption" "$PLIST" 2>/dev/null || true
$PB -c "Add :ITSAppUsesNonExemptEncryption bool false" "$PLIST"

# Version + build
$PB -c "Set :CFBundleShortVersionString $VERSION_NAME" "$PLIST"
$PB -c "Set :CFBundleVersion $BUILD_NUMBER" "$PLIST"

# Bundle ID sanity check — must match app.getsafetea.mobile
BUNDLE_ID=$($PB -c "Print :CFBundleIdentifier" "$PLIST")
if [[ "$BUNDLE_ID" != "app.getsafetea.mobile" ]]; then
  echo "WARN: Info.plist CFBundleIdentifier is '$BUNDLE_ID', forcing to 'app.getsafetea.mobile'"
  $PB -c "Set :CFBundleIdentifier app.getsafetea.mobile" "$PLIST"
fi

# Display name — keep short for home screen, full name in App Store metadata
$PB -c "Set :CFBundleDisplayName SafeTea" "$PLIST" 2>/dev/null || \
  $PB -c "Add :CFBundleDisplayName string SafeTea" "$PLIST"

# CFBundleName — the formal app name shown in Settings and system prompts
$PB -c "Delete :CFBundleName" "$PLIST" 2>/dev/null || true
$PB -c "Add :CFBundleName string SafeTea" "$PLIST"

echo "iOS metadata set:"
echo "  Version: $VERSION_NAME ($BUILD_NUMBER)"
echo "  Bundle:  app.getsafetea.mobile"
echo "  Plist:   $PLIST"
