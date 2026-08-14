#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$(mktemp -d)"
TEST_BIN="$TEST_DIR/bin"
TEST_LOG="$TEST_DIR/events.log"
TEST_VIDEO="$TEST_DIR/demo.mp4"

cleanup() {
  rm -rf "$TEST_DIR"
}
trap cleanup EXIT

mkdir -p "$TEST_BIN"
export TEST_LOG ROOT_DIR

cat > "$TEST_BIN/java" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$TEST_BIN/open" <<'EOF'
#!/usr/bin/env bash
exit 0
EOF

cat > "$TEST_BIN/maestro" <<'EOF'
#!/usr/bin/env bash
echo maestro >> "$TEST_LOG"
exit 0
EOF

cat > "$TEST_BIN/xcodebuild" <<'EOF'
#!/usr/bin/env bash
mkdir -p "$ROOT_DIR/DerivedData/RecordDemo/Build/Products/Debug-iphonesimulator/QRScanner.app"
exit 0
EOF

cat > "$TEST_BIN/xcrun" <<'EOF'
#!/usr/bin/env bash
if [[ "$*" == "simctl list devices available --json" ]]; then
  cat <<'JSON'
{"devices":{"com.apple.CoreSimulator.SimRuntime.iOS-17-0":[{"name":"iPhone 15","udid":"TEST-DEVICE","state":"Shutdown","isAvailable":true}]}}
JSON
elif [[ " $* " == *" simctl terminate "* ]]; then
  echo terminate >> "$TEST_LOG"
elif [[ " $* " == *" simctl io "*" recordVideo "* ]]; then
  echo record >> "$TEST_LOG"
  printf video > "${@: -1}"
  echo "Recording started"
fi
exit 0
EOF

chmod +x "$TEST_BIN"/*

PATH="$TEST_BIN:/usr/bin:/bin" \
  "$ROOT_DIR/scripts/record-demo.sh" \
  "$ROOT_DIR/e2e/smoke.yaml" \
  "$TEST_VIDEO" \
  iPhone >/dev/null

actual="$(grep -E '^(maestro|terminate|record)$' "$TEST_LOG" | paste -sd ' ' -)"
expected="maestro terminate record maestro"

if [[ "$actual" != "$expected" ]]; then
  echo "expected: $expected" >&2
  echo "actual:   $actual" >&2
  exit 1
fi

echo "record-demo ordering passed"
