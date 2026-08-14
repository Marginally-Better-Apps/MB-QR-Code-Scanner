#!/usr/bin/env bash
# Build, launch, drive, and record the SwiftUI app on an iOS Simulator.
# Usage: ./scripts/record-demo.sh [e2e/flow.yaml] [artifacts/demo.mp4] [iPhone|iPad]
set -euo pipefail

FLOW="${1:-e2e/smoke.yaml}"
OUTPUT="${2:-artifacts/qr-scanner-demo.mp4}"
DEVICE_FAMILY="${3:-iPhone}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA="${ROOT_DIR}/DerivedData/RecordDemo"

for tool in maestro xcodebuild xcrun; do
  if ! command -v "$tool" >/dev/null 2>&1; then
    echo "error: $tool is required" >&2
    exit 1
  fi
done

if ! java -version >/dev/null 2>&1; then
  echo "error: a Java runtime is required by Maestro (Java 17 or newer recommended)" >&2
  exit 1
fi

cd "$ROOT_DIR"
DEVICE_ID="$(./scripts/select-simulator.py "$DEVICE_FAMILY")"

xcrun simctl boot "$DEVICE_ID" 2>/dev/null || true
xcrun simctl bootstatus "$DEVICE_ID" -b
open -a Simulator --args -CurrentDeviceUDID "$DEVICE_ID"

xcodebuild \
  -project QRScanner.xcodeproj \
  -scheme QRScanner \
  -configuration Debug \
  -destination "platform=iOS Simulator,id=${DEVICE_ID}" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  build

APP_PATH="$(find "$DERIVED_DATA/Build/Products" -path '*iphonesimulator/QRScanner.app' -type d | head -1)"
if [[ -z "$APP_PATH" ]]; then
  echo "error: QRScanner.app was not produced" >&2
  exit 1
fi

xcrun simctl install "$DEVICE_ID" "$APP_PATH"

if ! grep -Eq '^[[:space:]]*-[[:space:]]+startRecording' "$FLOW" || \
   ! grep -Eq '^[[:space:]]*-[[:space:]]+stopRecording' "$FLOW"; then
  echo "error: $FLOW must bound its recorded interactions with startRecording and stopRecording" >&2
  exit 1
fi

CAPTURE_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qr-scanner-capture.XXXXXX")"
cleanup() {
  rm -rf "$CAPTURE_DIR"
}
trap cleanup EXIT

maestro test \
  --device "$DEVICE_ID" \
  --test-output-dir "$CAPTURE_DIR" \
  "$FLOW"

RECORDED_VIDEO="$(find "$CAPTURE_DIR" -type f -name '*.mp4' -print -quit)"
if [[ -z "$RECORDED_VIDEO" ]]; then
  echo "error: Maestro did not produce a recording" >&2
  exit 1
fi

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
mv "$RECORDED_VIDEO" "$OUTPUT"

test -s "$OUTPUT"
echo "Demo saved to $OUTPUT"
