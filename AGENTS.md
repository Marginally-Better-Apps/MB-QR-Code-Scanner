# QR Scanner agent notes

Native SwiftUI iOS/iPadOS 17+ project. Keep the committed Xcode project dependency-free unless a feature clearly requires a package.

Roadmap: https://planista.shloklab.us/AhljFFbc1VaGq4XX

## Commands

```sh
python3 scripts/test-semantic-version.py
DEVICE_ID="$(./scripts/select-simulator.py iPhone)"
xcodebuild test -project QRScanner.xcodeproj -scheme QRScanner -destination "platform=iOS Simulator,id=${DEVICE_ID}" -derivedDataPath DerivedData/Local CODE_SIGNING_ALLOWED=NO
```

The target must continue to support both device families (`TARGETED_DEVICE_FAMILY = "1,2"`).

## Release policy

PR titles become squash-merge commit subjects. `fix:` bumps patch, `feat:` bumps minor, and `feat!:` / `feat(scope)!:` bumps major. Other commits do not produce a release artifact. Do not create release tags; `.github/workflows/release.yml` publishes unsigned IPA artifacts only.
