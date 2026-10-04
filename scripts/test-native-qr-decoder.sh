#!/usr/bin/env bash
set -euo pipefail

# Real-pixel decoding, preview geometry, and frame throttling are Swift Testing suites
# in `swift test` (macOS Vision). Without arguments this runs those suites.
#
# Pass a booted Simulator UDID to run the QR pixel-to-History check with the iOS SDK's
# Vision runtime instead, which is the part that genuinely needs the Simulator.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if [[ -z "${1:-}" ]]; then
  swift test --package-path "$ROOT_DIR" \
    --filter 'VisionDecodingTests|PreviewGeometryTests|DetectionProjectionTests|FrameThrottleTests'
  exit 0
fi

TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qr-native-decoder.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT

DECODER_SOURCES=()
while IFS= read -r source; do
  DECODER_SOURCES+=("$source")
done < <(find "$ROOT_DIR/Sources/QRScannerCore" -name '*.swift' | sort)
DECODER_SOURCES+=(
  "$ROOT_DIR/Tests/QRScannerCoreTests/Support/CodeImages.swift"
  "$ROOT_DIR/scripts/native-qr-decoder-test.swift"
)

xcrun --sdk iphonesimulator swiftc "${DECODER_SOURCES[@]}" \
  -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
  -target "$(uname -m)-apple-ios17.0-simulator" \
  -o "$TEST_DIR/ios-native-qr-decoder-test"
xcrun simctl spawn "$1" "$TEST_DIR/ios-native-qr-decoder-test" \
  "$ROOT_DIR/native/QRScanner/Fixtures/normal-qr.png" \
  "$ROOT_DIR/native/QRScanner/Fixtures/damaged-distant-qr.png"
