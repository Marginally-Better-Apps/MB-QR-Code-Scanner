# Scanner performance checks

Recognition runs on its own queue, never on the main thread. At most one detection result waits for the main queue; newer frames are dropped until it is delivered. Late camera frames are discarded by AVFoundation. Under serious or critical thermal state, or in Low Power Mode, only 1 in 4 frames runs detection (about 7.5 fps from a 30 fps camera). The rate updates from `ProcessInfo` notifications, not polling. These rules are in `FrameThrottle` and covered by `swift test`.

Camera frames are never saved. The multicode detector makes one Vision request with all formats supported by the current OS. Product lookup runs only after a tap, outside the frame path. Session start, stop, zoom, focus, and torch changes run on a capture queue, not the main thread.

The UI expiration timer runs only while scanning. A camera frame refreshes matching result bounds without changing result order. History acceptance and haptics use actual sightings, never the UI hold timer.

The React Native measurements from earlier commits do not describe the SwiftUI build. Before release, measure cold-start time, frame latency, memory, detection rate for small 1D codes, and thermal behavior on a physical iPhone during a ten-minute scanning session. Compare QR-only and all-format Vision requests on at least an older supported iPhone and a current one. If the full set lowers responsiveness, split common and rare formats across successive frames while retaining one pending delivery. Simulator acceptance checks behavior, not camera performance.
