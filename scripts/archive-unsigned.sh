#!/usr/bin/env bash
# Archive the native app for generic iOS devices without code signing.
# Package the result with scripts/package-ipa.sh and verify it with scripts/assert-native-ipa.sh.
#
# Usage: scripts/archive-unsigned.sh [--version X.Y.Z] [--build-number N] <archive.xcarchive> [derived-data-dir]
set -euo pipefail

usage() {
  echo "usage: $0 [--version X.Y.Z] [--build-number N] <archive.xcarchive> [derived-data-dir]" >&2
  exit 2
}

VERSION=""
BUILD_NUMBER=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --version) VERSION="${2:?--version needs a value}"; shift 2 ;;
    --build-number) BUILD_NUMBER="${2:?--build-number needs a value}"; shift 2 ;;
    -h|--help) usage ;;
    --) shift; break ;;
    -*) usage ;;
    *) break ;;
  esac
done

ARCHIVE="${1:-}"
[[ -n "$ARCHIVE" ]] || usage
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DERIVED_DATA="${2:-$ROOT_DIR/DerivedData/Archive}"

absolute() {
  case "$1" in
    /*) printf '%s\n' "$1" ;;
    *) printf '%s/%s\n' "$PWD" "$1" ;;
  esac
}
ARCHIVE="$(absolute "$ARCHIVE")"
DERIVED_DATA="$(absolute "$DERIVED_DATA")"

OVERRIDES=()
[[ -n "$VERSION" ]] && OVERRIDES+=("MARKETING_VERSION=$VERSION")
[[ -n "$BUILD_NUMBER" ]] && OVERRIDES+=("CURRENT_PROJECT_VERSION=$BUILD_NUMBER")

rm -rf "$ARCHIVE"
cd "$ROOT_DIR"
xcodebuild archive \
  -project native/QRScanner.xcodeproj \
  -scheme QRScanner \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -archivePath "$ARCHIVE" \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO \
  CODE_SIGNING_REQUIRED=NO \
  CODE_SIGN_IDENTITY="" \
  DEVELOPMENT_TEAM="" \
  ${OVERRIDES[@]+"${OVERRIDES[@]}"}

test -d "$ARCHIVE/Products/Applications"
echo "Archived $ARCHIVE"
