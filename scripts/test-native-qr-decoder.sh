#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qr-native-decoder.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT

DECODER_SOURCES=(
  "$ROOT_DIR/native/QRScanner/QRVisionDetector.swift"
  "$ROOT_DIR/native/QRScanner/QRScanFrame.swift"
  "$ROOT_DIR/native/QRScanner/QRPreviewGeometry.swift"
  "$ROOT_DIR/Sources/QRScannerCore/ScanSession.swift"
  "$ROOT_DIR/Sources/QRScannerCore/ScanPayload.swift"
  "$ROOT_DIR/Sources/QRScannerCore/CalendarDate.swift"
  "$ROOT_DIR/Sources/QRScannerCore/HistoryStore.swift"
  "$ROOT_DIR/scripts/native-qr-decoder-test.swift"
)
xcrun swiftc "${DECODER_SOURCES[@]}" \
  -framework ImageIO \
  -framework CoreImage \
  -framework Vision \
  -o "$TEST_DIR/native-qr-decoder-test"

"$TEST_DIR/native-qr-decoder-test" \
  "$ROOT_DIR/native/QRScanner/Fixtures/normal-qr.png" \
  "$ROOT_DIR/native/QRScanner/Fixtures/damaged-distant-qr.png"

xcrun swiftc \
  "$ROOT_DIR/native/QRScanner/QRPreviewGeometry.swift" \
  "$ROOT_DIR/scripts/native-preview-geometry-test.swift" \
  -parse-as-library \
  -o "$TEST_DIR/native-preview-geometry-test"

"$TEST_DIR/native-preview-geometry-test"

# An optional booted Simulator runs the same pixel-to-History checks with the iOS SDK.
if [[ -n "${1:-}" ]]; then
  xcrun --sdk iphonesimulator swiftc "${DECODER_SOURCES[@]}" \
    -sdk "$(xcrun --sdk iphonesimulator --show-sdk-path)" \
    -target "$(uname -m)-apple-ios17.0-simulator" \
    -o "$TEST_DIR/ios-native-qr-decoder-test"
  xcrun simctl spawn "$1" "$TEST_DIR/ios-native-qr-decoder-test" \
    "$ROOT_DIR/native/QRScanner/Fixtures/normal-qr.png" \
    "$ROOT_DIR/native/QRScanner/Fixtures/damaged-distant-qr.png"
fi
