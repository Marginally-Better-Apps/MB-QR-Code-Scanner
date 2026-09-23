# QR Scanner

An iPhone and iPad QR scanner built with SwiftUI, AVFoundation, and on-device Vision. No third-party runtime or network service is required.

All detected codes appear together in one Liquid Glass panel on iOS 26. Earlier iOS versions use system material. Highlights survive brief detection gaps. History uses native swipe-to-delete, confirmation for clearing, and Undo.

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
python3 scripts/test-ci-workflows.py
```

Install the built app in a simulator, then run the native UI acceptance flow with Maestro:

```sh
maestro test e2e/native-ui-acceptance.yaml
maestro test e2e/native-image-scan-acceptance.yaml
```

The UI flows check simultaneous results, native menus, repeated swipe/delete/undo, and actual QR image decoding through the native preview into results and History. The image flow has no synthetic success fallback. The native decoder script also renders QR images into BGRA camera buffers and checks decoding, preview projection, acceptance, and persisted History. It covers normal/damaged images in four orientations, 11 payload formats, multiple codes, and blank frames.

Pass a booted simulator UDID to `./scripts/test-native-qr-decoder.sh <UDID>` to run the pixel-to-History checks against the iOS SDK too. Simulator Vision requests use supported CPU compute stages for actual decoding; device builds keep system-selected hardware acceleration.

Fixture launch arguments are enabled only in Debug builds and the simulator. Device Release builds always use the camera. Simulator and image tests do not verify physical camera focus or hardware capture.

## Data and privacy

Camera frames stay on the device. Nothing opens, copies, or shares without a tap. Authentication secrets are never copied, shared, or stored. Wi-Fi passwords are excluded from History and displayed details.

The app retains the existing bundle identifier and `Documents/history/history-v1.json` schema. Upgrading from the React Native version keeps saved scans. History writes are atomic and protected by iOS file protection. An unreadable file is left unchanged.

## Releases

Pull requests build a standalone native unsigned IPA and publish a public `pr-<number>` prerelease with an Autoloader link. Autoloader signs the IPA for installation. CI rejects JavaScript bundles and React/Hermes frameworks in the native app.

On `main`, `fix:` titles produce patch releases, `feat:` minor releases, and `feat!:` major releases. Other titles do not release. Squash merge to retain the PR title as the release commit.
