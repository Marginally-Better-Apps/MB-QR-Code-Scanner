# Scanner engine support

QR Scanner selects one live camera engine at process start. The choice is hardware-based: **VisionKit Data Scanner is used only when `DataScannerViewController.isSupported` is true.** The AVFoundation metadata fallback is used only when that hardware flag is false. A temporarily unavailable Data Scanner session never switches engines.

## Decision table

| Data Scanner `isSupported` | Data Scanner `isAvailable` | Camera authorization | Engine | Starts capture |
| --- | --- | --- | --- | --- |
| true | true | authorized | VisionKit | yes |
| true | false | authorized | VisionKit | no; wait for availability |
| false | any | authorized | AVFoundation | yes |
| true | any | denied or restricted | VisionKit | no |
| false | any | denied or restricted | AVFoundation | no |
| any | any | not determined | hardware-selected engine | no |

Denied and restricted states never construct or start an AVFoundation capture session as a way around the system prompt. The session store also refuses to start any observation source until camera access is `.ready`.

Both engines emit the same `ScannerObservation` contract: QR payload string, preview-normalized bounds in `0...1` preview coordinates, timestamp, and engine identity. Both request QR symbology only and can report every visible QR code in a frame. Recognition uses the full usable preview (`rectOfInterest` / Data Scanner region remain edge-to-edge); the center guide is visual coaching, not a crop. Preview layers use aspect-fill gravity, and observation bounds are remapped after rotation and layout changes. AVFoundation installs pinch-to-zoom and tap-to-focus on the preview; VisionKit keeps its native camera gestures. Scanning pauses while the scene is inactive, the app is backgrounded, or History fully obscures Scanner, then resumes once when the scanner is visible and active again. Camera session and metadata work stay off the SwiftUI render path; only published observations hop to the main actor.

## Supported-device matrix (iOS 17+)

VisionKit Data Scanner requires iOS 16 or later **and** an A12 Bionic or newer device. This app’s minimum is iOS 17, so the remaining split is silicon, not OS.

| Family | VisionKit primary (A12+) | AVFoundation fallback |
| --- | --- | --- |
| iPhone | iPhone XS / XR and later | none remaining on iOS 17 |
| iPad | iPad mini (5th generation) and later A12+ models, including iPad (8th generation)+, iPad Air (3rd generation)+, iPad Pro (11-inch, all), iPad Pro 12.9-inch (3rd generation)+ | iPad (6th and 7th generation), iPad Pro 10.5-inch, iPad Pro 12.9-inch (2nd generation) |
| Simulator | treated as unsupported | selected; capture starts only if the simulated camera and video authorization exist |

## Device-lab plan

Fallback-eligible hardware is not assumed to be attached to CI. When a physical fallback device is available, install an unsigned IPA on one of:

- iPad (6th generation) or iPad (7th generation)
- iPad Pro 10.5-inch
- iPad Pro 12.9-inch (2nd generation)

Then confirm: camera permission still gates preview, two printed QR codes produce two payloads, and `engineID` is `avfoundation`. Until that device is in the lab, automated unit tests cover selection and metadata translation, and Simulator/UI evidence covers the shell when Data Scanner support is false.
