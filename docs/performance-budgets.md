# Scanner performance checks

The Swift camera implementation keeps recognition off the main thread, allows at most one pending delivery, and skips frames under thermal or low-power pressure. It never saves camera frames.

The UI expiration timer runs only while scanning. A camera frame refreshes matching result bounds without changing result order. History acceptance and haptics use actual sightings, never the UI hold timer.

The React Native measurements from earlier commits do not describe the SwiftUI build. Before release, measure cold-start time, frame latency, memory, and thermal behavior on a physical iPhone during a ten-minute scanning session. Simulator acceptance checks behavior, not camera performance.
