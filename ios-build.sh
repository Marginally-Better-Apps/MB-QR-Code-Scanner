#!/usr/bin/env bash
set -euo pipefail

: "${GALA_BUILD_DIR:?Gala build directory is required}"
: "${GALA_ARTIFACT_DIR:?Gala artifact directory is required}"

DERIVED_DATA="$GALA_BUILD_DIR/DerivedData"
xcodebuild -quiet \
  -project native/QRScanner.xcodeproj -scheme QRScanner \
  -configuration Release -destination 'generic/platform=iOS' \
  -derivedDataPath "$DERIVED_DATA" \
  CODE_SIGNING_ALLOWED=NO build

APP="$DERIVED_DATA/Build/Products/Release-iphoneos/QRScanner.app"
test -d "$APP"
STAGE="$(mktemp -d "${TMPDIR:-/tmp}/qrscanner-gala.XXXXXX")"
trap 'rm -rf "$STAGE"' EXIT
mkdir -p "$STAGE/Payload" "$GALA_ARTIFACT_DIR"
ditto "$APP" "$STAGE/Payload/QRScanner.app"
IPA="$GALA_ARTIFACT_DIR/QRScanner.ipa"
(cd "$STAGE" && zip -qry "$IPA" Payload)
scripts/assert-native-ipa.sh "$IPA"
shasum -a 256 "$IPA"
