# Native CI

CI uses Xcode 26+, Swift Testing, the native image-decoder check, and a standalone Release simulator build. Maestro checks the native multi-code panel and repeated swipe/delete/undo. There is no npm install, Expo prebuild, CocoaPods, or JavaScript bundling step.

PR and release archives use `native/QRScanner.xcodeproj`. Archive caches include the Xcode version and native source inputs. `scripts/assert-native-ipa.sh` checks privacy metadata and rejects JavaScript bundles or React/Hermes frameworks.
