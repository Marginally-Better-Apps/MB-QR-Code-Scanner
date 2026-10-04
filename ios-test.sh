#!/usr/bin/env bash
# Entry point for the local Gala test runner (untracked .gala/); mirrors CI's non-simulator checks.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")"
swift test
scripts/test-native-qr-decoder.sh
python3 scripts/test-semantic-version.py
python3 scripts/test-select-simulator.py
python3 scripts/test-write-autoloader-page.py
