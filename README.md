# QR Scanner

Support: [help@marginally-better.app](mailto:help@marginally-better.app). See the [privacy policy](docs/privacy-policy.md).

An iPhone and iPad code scanner built with SwiftUI, AVFoundation, and on-device Vision. Live scanning and photo decoding work offline. Select an image with Photos or drop an image onto Scanner to read every code in it. Photos and History share a compact glass pill; Scan Another returns to the camera. Product lookup uses Open Food Facts only when you tap Look Up Product.

All detected codes appear together in one Liquid Glass panel on iOS 26. Earlier iOS versions use system material. Highlights survive brief detection gaps. History uses native swipe-to-delete, confirmation for clearing, and Undo.

The scanner requests every barcode format supported by the current iOS Vision revision, including QR, Aztec, Data Matrix, PDF417, EAN/UPC, Code 128, and GS1 DataBar. Results show the detected format. Valid retail identifiers can be looked up across the Open Food Facts product databases. IATA-style boarding pass data is summarized without saving the raw ticket.

## Build

Open `native/QRScanner.xcodeproj` in Xcode 26 or later. Select the QRScanner scheme and an iPhone or iPad. The deployment target is iOS 17.

```sh
xcodebuild -project native/QRScanner.xcodeproj -scheme QRScanner \
  -configuration Release -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath DerivedData/Native CODE_SIGNING_ALLOWED=NO build
```

## Test

```sh
swift test
./scripts/test-native-qr-decoder.sh
python3 scripts/test-semantic-version.py
python3 scripts/test-select-simulator.py
python3 scripts/test-write-autoloader-page.py
python3 scripts/test-built-app.py DerivedData/Native/Build/Products/Release-iphonesimulator/QRScanner.app
```

Install the built app in a simulator, then run the Maestro flows. `./scripts/install-maestro.sh` installs the pinned Maestro version CI uses.

```sh
maestro test e2e/native-image-scan-acceptance.yaml
maestro test e2e/native-ui-acceptance.yaml
maestro test e2e/acceptance-journey.yaml
xcrun simctl addmedia booted native/QRScanner/Fixtures/normal-qr.png
maestro test e2e/photo-import-acceptance.yaml
```

The UI flows check simultaneous results, native menus, repeated swipe/delete/undo, and actual QR image decoding through the native preview into results and History. The image flow has no synthetic success fallback. The native decoder script renders QR, Aztec, PDF417, Code 128, and EAN-13 images into BGRA camera buffers and checks decoding, preview projection, acceptance, and persisted History. It also covers normal/damaged QR images in four orientations, multiple codes, and blank frames.

Pass a booted simulator UDID to `./scripts/test-native-qr-decoder.sh <UDID>` to run the QR pixel-to-History checks against the iOS SDK too. Simulator Vision requests use supported CPU compute stages for actual decoding; device builds keep system-selected hardware acceleration. The other barcode pixel checks run on macOS because iOS Simulator 26.5's Vision fails to decode the generated Aztec fixture even with an Aztec-only request.

Fixture launch arguments are enabled only in Debug builds and the simulator. The fixture images in `native/QRScanner/Fixtures` are excluded from device builds. Device Release builds always use the camera. Simulator and image tests do not verify physical camera focus or hardware capture.

Developer tools: `./scripts/record-demo.sh [flow] [output.mp4] [iPhone|iPad]` records a Maestro flow on a simulator, and `swift scripts/generate-qr-fixtures.swift` regenerates the fixture images, and `swift scripts/make-test-sheet.swift` writes a printable sheet of labelled test codes for `docs/physical-checklist.md`. `ios-build.sh` and `ios-test.sh` are entry points for a local build runner, not CI.

## Data and privacy

Camera frames and imported images stay on the device. Imported images are decoded without being saved by the app. In History settings, Save scan location optionally adds a foreground location fix and searchable place name to live scans. Photo imports are never tagged with the current device location. Location is off by default and unavailable fixes do not delay results. Apple’s geocoding service may receive coordinates to resolve a place name. Nothing opens, copies, shares, or looks up a product without a tap. Authentication secrets and raw boarding passes are never copied, shared, or stored. Wi-Fi passwords are excluded from History and displayed details. A product lookup sends only the validated barcode number to Open Food Facts. Product records are community supplied and may be missing or wrong.

The app retains the existing bundle identifier and `Documents/history/history-v1.json` schema. Upgrading from the React Native version keeps saved scans. History writes are atomic and protected by iOS file protection. An unreadable file is left unchanged.

## CI and releases

CI runs on every pull request and on `main`. An Ubuntu job tests the Python release tooling. A macOS job selects Xcode 26+, runs `swift test` and the native decoder checks, builds the Release simulator app, checks it with `test-built-app.py`, and runs the Maestro flows on an iPhone simulator.

Pull requests that are not drafts also build a standalone native unsigned IPA. A read-only job archives it with `scripts/archive-unsigned.sh`, packages it with `scripts/package-ipa.sh`, and verifies it with `scripts/assert-native-ipa.sh`. A separate publish job holds the write token and publishes a public `pr-<number>` prerelease with an Autoloader link (same-repo PRs only; see [Autoloader PR preview](docs/AUTOLOADER_DEV_CYCLE.md)). Autoloader signs the IPA for installation. The IPA check rejects JavaScript bundles and React/Hermes frameworks.

PR titles must be Conventional Commits (`type(scope)!: summary`). On `main`, `fix:` titles produce patch releases, `feat:` minor releases, and `feat!:` major releases. Other types do not release. Squash merge to retain the PR title as the release commit. Releases archive from a clean DerivedData. Actions are pinned to commit SHAs and updated by Dependabot.
