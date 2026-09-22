# Agent notes

- iOS-only SwiftUI QR code scanner. No React Native, Expo, Metro, or JavaScript runtime.
- Open `native/QRScanner.xcodeproj`. Use Xcode 26+; deployment target is iOS 17.
- Camera capture and on-device Vision detection live in `native/QRScanner`.
- Pure parsing, scan-session, and History rules live in `Sources/QRScannerCore`; test with `swift test`.
- Preserve the bundle identifier and `Documents/history/history-v1.json` envelope when updating storage.
- Use native SwiftUI lists, menus, swipe actions, and Liquid Glass. Keep the UI minimal.
- Release archives must be standalone native apps. Verify the IPA with `scripts/assert-native-ipa.sh`.
