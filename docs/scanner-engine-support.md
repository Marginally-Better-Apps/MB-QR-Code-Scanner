# Scanner engine

The SwiftUI app uses AVFoundation for live frames and its preview layer. One Vision request detects every barcode symbology reported by the running OS across the full frame. That includes QR, Micro QR, Aztec, Data Matrix, PDF417, MicroPDF417, EAN, UPC, Code 128, GS1 DataBar, and other linear formats. Core Image provides a QR-only fallback if Vision fails; Simulator also uses it when Vision returns no observations for a static test image. Empty device frames do not run a second decoder. The implementation is in `native/QRScanner/ScannerPreviewView.swift` and `QRVisionDetector.swift`.

Capture starts only after camera authorization. It pauses in History and whenever the scene is inactive. Rotation, pinch zoom, tap focus, thermal throttling, and a single pending frame delivery are retained from the previous native camera implementation.

Detection bounds stay visible through gaps shorter than 1.5 seconds. Scan acceptance uses real camera frames only. Two consecutive sightings or repeated sightings spanning 250 ms accept a scan. A two-second absence resets deduplication. Identity includes the symbology, so identical text in two formats remains two results.

Retail lookup is limited to valid EAN-8, EAN-13/UPC-A, UPC-E, ITF-14, and GS1 DataBar numbers with a valid check digit. It is user initiated and never runs on camera frames. Vision may support a format without decoding every damaged or distant instance; physical-device measurements and a larger fixture set are still required.

Run `scripts/test-native-qr-decoder.sh` for real-pixel decoding and preview geometry. The Simulator's static-image detector limitation is covered by an explicit simulator-only fallback; the macOS decoder test verifies the actual fixture pixels. A physical camera session still needs device testing.
