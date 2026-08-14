# QR Scanner

A native SwiftUI scaffold for an iPhone and iPad QR code scanner. The current app intentionally contains only Xcode's basic “Hello, world!” view; scanner behavior comes in the next product phase.

## Requirements

- Xcode with an iOS 17 or newer Simulator runtime
- Maestro CLI and Java 17+ only when running or recording end-to-end flows

Install the recording dependencies once with Homebrew. `openjdk@17` is keg-only, so the explicit link makes `java` available to non-interactive agent shells as well as normal Terminal sessions:

```sh
brew install maestro openjdk@17
brew link --force --overwrite openjdk@17
java -version
maestro --version
```

## Run and test

Open `QRScanner.xcodeproj` in Xcode, select an iPhone or iPad Simulator, and run the `QRScanner` scheme.

```sh
DEVICE_ID="$(./scripts/select-simulator.py iPhone)"
xcodebuild test \
  -project QRScanner.xcodeproj \
  -scheme QRScanner \
  -destination "platform=iOS Simulator,id=${DEVICE_ID}" \
  -derivedDataPath DerivedData/Local \
  CODE_SIGNING_ALLOWED=NO
```

Record the default Maestro smoke flow with:

```sh
./scripts/record-demo.sh
```

Pass `iPad` as the third argument to record on an iPad Simulator.

## CI and tagless releases

Pull requests run the Swift/XCTest suite, test the semantic-version calculator, verify universal iPhone/iPad support, and produce a cached unsigned IPA artifact. On `main`, only these commit/PR titles produce a semantic release artifact:

- `fix: ...` → patch
- `feat: ...` → minor
- `feat!: ...` or `feat(scope)!: ...` → major

Other titles do not release. Versions are calculated deterministically from first-parent commit messages, so no Git tags or automated version commits are created. Squash-merging is recommended so the PR title is retained as the commit subject. Unsigned IPAs must be signed separately before physical-device installation.
