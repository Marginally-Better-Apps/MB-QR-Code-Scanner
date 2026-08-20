# Scanner engine support

QR Scanner uses one live camera pipeline on every supported iPhone and iPad: AVFoundation supplies full-resolution video frames and an `AVCaptureVideoPreviewLayer`, then the native module recognizes QR codes with Vision. Core Image is used if Vision does not return a barcode for a frame. Avoiding an embedded `DataScannerViewController` also means cold launch does not depend on a child view-controller appearance transition.

## Decision table

| Camera authorization | Engine | Starts capture |
| --- | --- | --- |
| authorized | AVFoundation | yes |
| denied or restricted | AVFoundation | no |
| not determined | AVFoundation | after authorization succeeds |

Denied and restricted states never construct or start a capture session as a way around the system prompt. If the native view mounted while camera permission was unresolved, it builds the session when capture starts. The TypeScript session snapshot also carries the first activation into the React render, so the camera starts on cold launch without a navigation cycle.

The native pipeline emits the shared `ScannerObservation` contract: QR payload string, preview-normalized bounds in `0...1` coordinates, timestamp, and engine identity. Recognition covers the complete usable preview. The center guide is visual coaching, not a crop. The preview and video output share rotation, observation bounds are mapped through the aspect-fill preview layer, and the camera supports pinch zoom and tap focus. Scanning pauses while the scene is inactive, the app is backgrounded, or History obscures Scanner, then resumes when Scanner is visible and active again.

Live capture stays in the `scanner-engine` native module. Session state, fixtures, and product UI live in TypeScript. VisionKit capability reporting remains in the module for device diagnostics, but it does not select the live view-controller path.

## Image acceptance coverage

`scripts/generate-qr-fixtures.swift` creates a normal QR image and a distant, center-obscured QR image with high error correction. `scripts/test-native-qr-decoder.sh` compiles the production decoder on macOS and verifies that both images decode to the expected URL. CI runs this test on its macOS iOS job.

The Release Simulator flow `e2e/native-image-scan-acceptance.yaml` bundles and displays the damaged image, starts Scanner from a cleared app state, and verifies the native observation bridge, highlight, payload, and Copy action. Apple’s Simulator barcode frameworks do not return static-image observations, so the explicit Simulator-only fixture path supplies the expected observation after the macOS pixel-decoder test has covered recognition. Production devices never use that fallback.

## Physical-device verification

Before shipping, install the embedded-bundle Release archive on an iPhone and an iPad running iOS 17 or later. Confirm that the camera is visible immediately after permission is granted, the normal and damaged fixture images scan at several distances, two visible QR codes produce two payloads, and rotation, pinch zoom, tap focus, backgrounding, and the History round trip preserve scanning.
