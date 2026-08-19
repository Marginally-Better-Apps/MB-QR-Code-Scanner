# Agent notes

- iOS-only React Native (Expo SDK 57) QR code scanner.
- Live capture stays in the `scanner-engine` native module (VisionKit + AVFoundation).
- Product UI, session, fixtures, and tests live in TypeScript.
- Release archives embed the JS bundle. Do not ship a Metro-connected debug IPA.
