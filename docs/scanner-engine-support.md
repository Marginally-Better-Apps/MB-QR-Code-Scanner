# Scanner engine

The SwiftUI app uses AVFoundation for live frames and its preview layer. Vision detects QR codes across the full frame, with Core Image as a fallback. The implementation is in `native/QRScanner/ScannerPreviewView.swift` and `QRVisionDetector.swift`.

Capture starts only after camera authorization. It pauses in History and whenever the scene is inactive. Rotation, pinch zoom, tap focus, thermal throttling, and a single pending frame delivery are retained from the previous native camera implementation.

Detection bounds stay visible through gaps shorter than 1.5 seconds. Scan acceptance uses real camera frames only. Two consecutive sightings or repeated sightings spanning 250 ms accept a scan. A two-second absence resets deduplication.

Run `scripts/test-native-qr-decoder.sh` for real-pixel decoding and preview geometry. The Simulator's static-image detector limitation is covered by an explicit simulator-only fallback; the macOS decoder test verifies the actual fixture pixels. A physical camera session still needs device testing.
