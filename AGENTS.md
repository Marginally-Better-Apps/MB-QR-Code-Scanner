# QR Scanner agent notes

Native SwiftUI iOS/iPadOS 17+ project. Keep the committed Xcode project dependency-free unless a feature clearly requires a package.

Roadmap: https://planista.shloklab.us/AhljFFbc1VaGq4XX

## Commands

```sh
python3 scripts/test-semantic-version.py
DEVICE_ID="$(./scripts/select-simulator.py iPhone)"
xcodebuild test -project QRScanner.xcodeproj -scheme QRScanner -destination "platform=iOS Simulator,id=${DEVICE_ID}" -derivedDataPath DerivedData/Local CODE_SIGNING_ALLOWED=NO
./scripts/record-demo.sh e2e/smoke.yaml artifacts/demo.mp4 iPhone
```

`record-demo.sh` intentionally preflights the Maestro flow before starting `simctl` capture. Keep the preflight → terminate → recorder-ready → recorded-flow ordering so Java/driver startup never appears in acceptance videos. Verify it with `./scripts/test-record-demo.sh`.

If recording prerequisites are missing, install them globally for this user with:

```sh
brew install maestro openjdk@17
brew link --force --overwrite openjdk@17
```

The force-link is intentional: Homebrew keeps `openjdk@17` keg-only, while Maestro needs `java` on `PATH` in non-interactive agent shells. Confirm with `java -version` and `maestro --version` before recording.

The target must continue to support both device families (`TARGETED_DEVICE_FAMILY = "1,2"`). Use the `record-ios-app` skill when asked to record a Maestro-driven Simulator demo.

## Release policy

PR titles become squash-merge commit subjects. `fix:` bumps patch, `feat:` bumps minor, and `feat!:` / `feat(scope)!:` bumps major. Other commits do not produce a release artifact. Do not create release tags; `.github/workflows/release.yml` publishes unsigned IPA artifacts only.
