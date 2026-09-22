#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qr-native-decoder.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT

xcrun swiftc \
  "$ROOT_DIR/native/QRScanner/QRVisionDetector.swift" \
  "$ROOT_DIR/scripts/native-qr-decoder-test.swift" \
  -framework AppKit \
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
