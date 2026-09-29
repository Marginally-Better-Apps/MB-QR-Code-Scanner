#!/usr/bin/env bash
set -euo pipefail
IPA="${1:?Usage: $0 <app.ipa>}"
SCAN_CHECK_DIR="$(mktemp -d)"
trap 'rm -rf "$SCAN_CHECK_DIR"' EXIT
unzip -q "$IPA" -d "$SCAN_CHECK_DIR"
APP="$(find "$SCAN_CHECK_DIR/Payload" -maxdepth 1 -type d -name '*.app' -print -quit)"
test -n "$APP"
python3 "$(dirname "$0")/test-built-app.py" "$APP"
