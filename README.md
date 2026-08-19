# QR Scanner

iOS-only React Native QR scanner. The app opens to native Scanner and History tabs with recoverable camera-access states. On devices that support VisionKit Data Scanner, live capture uses that engine. Otherwise it falls back to AVFoundation QR metadata. History persistence arrives in later product stories.

The supported-device decision table lives in [docs/scanner-engine-support.md](docs/scanner-engine-support.md). Autoloader PR previews are described in [docs/AUTOLOADER_DEV_CYCLE.md](docs/AUTOLOADER_DEV_CYCLE.md).

## Requirements

- Node 22+
- Xcode with an iOS 17 or newer Simulator runtime
- CocoaPods
- Maestro CLI and Java 17+ only when running or recording end-to-end flows

```sh
npm ci
brew install maestro openjdk@17
brew link --force --overwrite openjdk@17
```

## Run and test

```sh
npm test
npx expo prebuild --platform ios
npx expo run:ios --configuration Release --device
```

Release archives embed the JS bundle. The IPA does not talk to Metro.

Record the default Maestro smoke flow with:

```sh
./scripts/record-demo.sh
```

Debug binaries and fixture launch arguments still inject named scanner detections without a camera feed:

```sh
./scripts/record-demo.sh \
  e2e/scanner-fixture-acceptance.yaml \
  artifacts/scanner-fixture-acceptance.mp4 \
  iPhone
```

## CI and tagless releases

Pull requests run the Jest suite, policy scripts, an iOS Simulator Release build with an embedded bundle, and publish an unsigned IPA as GitHub prerelease `pr-<number>` plus a tappable Autoloader link. On `main`, only these commit/PR titles produce a semantic release artifact:

- `fix: ...` → patch
- `feat: ...` → minor
- `feat!: ...` or `feat(scope)!: ...` → major

Other titles do not release. Versions are calculated from first-parent commit messages. Squash-merging is recommended so the PR title is retained as the commit subject. Unsigned IPAs must be signed separately before physical-device installation.
