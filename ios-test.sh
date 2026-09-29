#!/usr/bin/env bash
set -euo pipefail

swift test
scripts/test-native-qr-decoder.sh
python3 scripts/test-ci-workflows.py
