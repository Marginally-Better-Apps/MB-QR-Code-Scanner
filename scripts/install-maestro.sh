#!/usr/bin/env bash
# Install a pinned, checksum-verified Maestro CLI into $MAESTRO_DIR (default ~/.maestro).
# CI caches $MAESTRO_DIR keyed on this file, so bump the version and checksum together.
set -euo pipefail

MAESTRO_VERSION="2.10.0"
MAESTRO_SHA256="29b675e10cc12080e445e9bfb2e2b4e4dfb9c0f2e30d5884120d258b5e1cd991"
MAESTRO_DIR="${MAESTRO_DIR:-$HOME/.maestro}"
STAMP="$MAESTRO_DIR/.installed-version"

if [[ -x "$MAESTRO_DIR/bin/maestro" && "$(cat "$STAMP" 2>/dev/null)" == "$MAESTRO_VERSION" ]]; then
  echo "Maestro $MAESTRO_VERSION already installed in $MAESTRO_DIR"
  exit 0
fi

WORK_DIR="$(mktemp -d "${TMPDIR:-/tmp}/maestro-install.XXXXXX")"
trap 'rm -rf "$WORK_DIR"' EXIT

curl --fail --silent --show-error --location --retry 3 \
  --output "$WORK_DIR/maestro.zip" \
  "https://github.com/mobile-dev-inc/maestro/releases/download/cli-${MAESTRO_VERSION}/maestro.zip"
echo "${MAESTRO_SHA256}  $WORK_DIR/maestro.zip" | shasum -a 256 -c -

unzip -q "$WORK_DIR/maestro.zip" -d "$WORK_DIR"
rm -rf "${MAESTRO_DIR:?}/bin" "${MAESTRO_DIR:?}/lib"
mkdir -p "$MAESTRO_DIR"
cp -R "$WORK_DIR/maestro/." "$MAESTRO_DIR/"
echo "$MAESTRO_VERSION" > "$STAMP"
"$MAESTRO_DIR/bin/maestro" --version
