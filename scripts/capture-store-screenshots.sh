#!/usr/bin/env bash
# Capture App Store screenshots from the real app on Simulator, using the photos in design/store-screenshots.
# Uses its own Simulators, erased on every run, so Photos and History hold only the sample content.
# Usage: ./scripts/capture-store-screenshots.sh [output-dir]   (default: artifacts/store-screenshots)
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
OUTPUT="$(cd "$ROOT_DIR" && mkdir -p "${1:-artifacts/store-screenshots}" && cd "${1:-artifacts/store-screenshots}" && pwd)"
DERIVED_DATA="$ROOT_DIR/DerivedData/StoreScreenshots"
PHOTOS="$ROOT_DIR/design/store-screenshots"
BUNDLE_ID=com.marginallybetter.qrscanner

cd "$ROOT_DIR"
xcodebuild -project native/QRScanner.xcodeproj -scheme QRScanner -configuration Release \
  -destination 'generic/platform=iOS Simulator' -derivedDataPath "$DERIVED_DATA" CODE_SIGNING_ALLOWED=NO build -quiet
APP_PATH="$(find "$DERIVED_DATA/Build/Products" -path '*iphonesimulator/QRScanner.app' -type d | head -1)"

# The sizes App Store Connect asks for: 6.9" iPhone (1320 x 2868) and 13" iPad (2064 x 2752).
# Each entry: output folder | Simulator device type | where the newest photo sits in the picker.
for entry in \
  "iphone-6.9|com.apple.CoreSimulator.SimDeviceType.iPhone-17-Pro-Max|16%,24%" \
  "ipad-13|com.apple.CoreSimulator.SimDeviceType.iPad-Pro-13-inch-M5-12GB|45%,35%"; do
  IFS='|' read -r name device_type photo_point <<<"$entry"
  sim_name="MB QR Store Screenshots $name"
  device="$(xcrun simctl list devices available | sed -n "s/^ *$sim_name (\([0-9A-F-]*\)).*/\1/p" | head -1)"
  [[ -n "$device" ]] || device="$(xcrun simctl create "$sim_name" "$device_type")"
  xcrun simctl shutdown "$device" 2>/dev/null || true
  xcrun simctl erase "$device"
  xcrun simctl boot "$device"
  xcrun simctl bootstatus "$device" -b >/dev/null
  xcrun simctl status_bar "$device" override --time 9:41 --dataNetwork wifi --wifiBars 3 --cellularBars 4 \
    --batteryState charged --batteryLevel 100
  xcrun simctl install "$device" "$APP_PATH"
  ./scripts/seed-store-history.py "$(xcrun simctl get_app_container "$device" "$BUNDLE_ID" data)"
  xcrun simctl addmedia "$device" "$PHOTOS/campground-sign.jpg"

  capture="$(mktemp -d)"
  maestro test --device "$device" --test-output-dir "$capture" \
    -e CAMERA_PHOTO="$PHOTOS/camera-wifi-card.jpg" -e PHOTO_POINT="$photo_point" e2e/store-screenshots.yaml
  mkdir -p "$OUTPUT/$name"
  find "$capture" -path '*takeScreenshot*' -name '0*.png' -exec cp {} "$OUTPUT/$name/" \;
  rm -rf "$capture"
  xcrun simctl shutdown "$device"
done
echo "Screenshots saved to $OUTPUT"
