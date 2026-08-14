#!/usr/bin/env bash
# Build, launch, drive, and record the SwiftUI app on an iOS Simulator.
# Usage: ./scripts/record-demo.sh [e2e/flow.yaml] [artifacts/demo.mp4] [iPhone|iPad]
set -euo pipefail

FLOW="${1:-e2e/smoke.yaml}"
OUTPUT="${2:-artifacts/qr-scanner-demo.mp4}"
DEVICE_FAMILY="${3:-iPhone}"
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA="${ROOT_DIR}/DerivedData/RecordDemo"
APP_ID="com.marginallybetter.qrscanner"

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
xcrun simctl launch "$DEVICE_ID" "$APP_ID"

mkdir -p "$(dirname "$OUTPUT")"
rm -f "$OUTPUT"
xcrun simctl io "$DEVICE_ID" recordVideo --codec=h264 "$OUTPUT" &
RECORD_PID=$!

cleanup() {
  if kill -0 "$RECORD_PID" 2>/dev/null; then
    kill -INT "$RECORD_PID" 2>/dev/null || true
    wait "$RECORD_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

sleep 1
maestro test --device "$DEVICE_ID" "$FLOW"

kill -INT "$RECORD_PID" 2>/dev/null || true
wait "$RECORD_PID" 2>/dev/null || true
trap - EXIT

test -s "$OUTPUT"
echo "Demo saved to $OUTPUT"
