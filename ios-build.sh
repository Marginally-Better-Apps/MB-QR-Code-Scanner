#!/usr/bin/env bash
# Entry point for the local Gala build runner (untracked .gala/); CI uses .github/workflows instead.
set -euo pipefail

: "${GALA_BUILD_DIR:?Gala build directory is required}"
: "${GALA_ARTIFACT_DIR:?Gala artifact directory is required}"

cd "$(dirname "${BASH_SOURCE[0]}")"
ARCHIVE="$GALA_BUILD_DIR/QRScanner.xcarchive"
IPA="$GALA_ARTIFACT_DIR/QRScanner.ipa"
LOG="$GALA_BUILD_DIR/xcodebuild.log"
mkdir -p "$GALA_BUILD_DIR" "$GALA_ARTIFACT_DIR"

if ! scripts/archive-unsigned.sh "$ARCHIVE" "$GALA_BUILD_DIR/DerivedData" > "$LOG" 2>&1; then
  tail -50 "$LOG" >&2
  exit 1
fi
scripts/package-ipa.sh "$ARCHIVE" "$IPA"
scripts/assert-native-ipa.sh "$IPA"
shasum -a 256 "$IPA"
