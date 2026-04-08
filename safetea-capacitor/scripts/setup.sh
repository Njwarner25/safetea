#!/usr/bin/env bash
# SafeTea Capacitor — one-shot setup script.
# Run from safetea-capacitor/ on a macOS machine with Xcode 26 + Android Studio installed.
set -euo pipefail

echo "==> Checking toolchain..."
command -v node >/dev/null || { echo "Node 20+ required"; exit 1; }
command -v npm  >/dev/null || { echo "npm required"; exit 1; }

if [[ "$(uname)" == "Darwin" ]]; then
  command -v xcodebuild >/dev/null || { echo "Xcode 26 required for iOS"; exit 1; }
  XCODE_VERSION=$(xcodebuild -version | head -1 | awk '{print $2}')
  echo "Xcode version: $XCODE_VERSION (require >= 26.0 for ITMS-90725)"
fi

echo "==> Installing JS dependencies..."
npm install

echo "==> Generating icon + splash from assets/..."
npx @capacitor/assets generate \
  --iconBackgroundColor "#ffffff" \
  --iconBackgroundColorDark "#ffffff" \
  --splashBackgroundColor "#ffffff" \
  --splashBackgroundColorDark "#ffffff" || true

echo "==> Adding iOS platform..."
[ -d ios ] || npx cap add ios

echo "==> Adding Android platform..."
[ -d android ] || npx cap add android

echo "==> Syncing native projects..."
npx cap sync

echo
echo "✅ Setup complete."
echo
echo "Next steps:"
echo "  iOS:     npx cap open ios      (Xcode → set Team → Archive → Upload)"
echo "  Android: npx cap open android  (Android Studio → Signed AAB → Play Console)"
