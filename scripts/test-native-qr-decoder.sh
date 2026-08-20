#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d "${TMPDIR:-/tmp}/qr-native-decoder.XXXXXX")"
trap 'rm -rf "$TEST_DIR"' EXIT

xcrun swiftc \
  "$ROOT_DIR/modules/scanner-engine/ios/QRVisionDetector.swift" \
  "$ROOT_DIR/scripts/native-qr-decoder-test.swift" \
  -framework AppKit \
  -framework CoreImage \
  -framework Vision \
  -o "$TEST_DIR/native-qr-decoder-test"

"$TEST_DIR/native-qr-decoder-test" \
  "$ROOT_DIR/modules/scanner-engine/ios/Fixtures/normal-qr.png" \
  "$ROOT_DIR/modules/scanner-engine/ios/Fixtures/damaged-distant-qr.png"
