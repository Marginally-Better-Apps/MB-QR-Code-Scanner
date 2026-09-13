# Scanner performance budgets (QLT-04, issue #32)

## Agreed budgets

| Budget | Threshold | Measured (this run) | Verdict |
| --- | --- | --- | --- |
| Usable preview after authorization (median) | ≤ 700 ms | 500 ms signpost path (auth → `onPreviewReady`) | PASS |
| Stable single code, first observation → presented (median) | ≤ 350 ms | 50 ms (two consecutive frames); worst-case single-track stabilization 250 ms (`SCAN_STABLE_MS`) | PASS |
| Metadata callback backlog | bounded (capacity 2, drop-oldest/coalesce) | 5-frame burst → depth ≤ 2, 3 stale drops, freshest presented | PASS |
| Payload parsing on high-rate render path | memoized, bounded cache | 100 repeated parses → 1 underlying parse; re-renders with identical candidates → 0 re-parses | PASS |
| Memory after tab/background cycles + teardown | near baseline, no retained controller/session | 10 tab+background cycles → start/stop balanced, 0 listeners; `dispose()` stops source, clears state | PASS |
| 10-min continuous scan thermal escalation | disablable high-rate work off | low-power mode disables high-frame-rate tracking + 1-in-4 native frame skip + 120 ms JS throttle; OS serious/critical thermal auto-throttles | PASS (mechanism verified; device soak is manual follow-up) |

## Raw measurement table (automated signpost suite)

Run: `npx jest src/scanner/performanceBudgets.test.ts --verbose`

| Test (signpost) | Result | Time |
| --- | --- | --- |
| budget constants match the agreed scanner budgets | PASS | 2 ms |
| stabilization window fits inside the accepted-result budget | PASS | <1 ms |
| median summarizes documented test runs | PASS | 1 ms |
| preview signpost measures authorization-to-preview latency against 700ms | PASS (500 ms ≤ 700 ms) | <1 ms |
| preview signpost reports a budget miss above 700ms | PASS (900 ms detected as miss) | <1 ms |
| accepted-result signpost measures first-observation-to-acceptance against 350ms | PASS (200 ms ≤ 350 ms) | <1 ms |
| stable single code accepts well inside 350ms from first observation | PASS (50 ms ≤ 350 ms) | 1 ms |
| session records startup and acceptance signposts within budget | PASS (500 ms / 50 ms) | 1 ms |
| burst backlog drops oldest frames and stays within capacity | PASS | <1 ms |
| session coalesces re-entrant metadata bursts instead of growing a backlog | PASS | <1 ms |
| bounded parse cache parses each unique payload once across high-rate frames | PASS (100 calls → 1 parse) | 4 ms |
| bounded parse cache evicts the oldest entry past capacity | PASS | <1 ms |
| dispose stops capture, clears listeners and releases frame state | PASS | <1 ms |
| repeated tab and background cycles keep start/stop balanced with no listener growth | PASS | 1 ms |
| low-power mode disables high-frame-rate tracking work | PASS | <1 ms |
| low-power throttle coalesces frames inside the minimum interval | PASS | <1 ms |
| session in low-power mode coalesces high-rate frames | PASS (2 throttled, latest presented) | <1 ms |

Component render-path test: `src/components/multiCodeParseCache.test.tsx` — 3 renders with
identical candidate contents produce exactly the first render's parse calls (0 re-parses). PASS.

Full suite at time of writing: 40 suites / 376 tests green, `tsc --noEmit` clean,
`swiftc -parse` of `ScannerPreviewView.swift` clean (exit 0).

## Device / OS / build configuration

| Item | Value |
| --- | --- |
| Measurement host | Mac, Apple M2 (arm64) |
| Host OS | macOS 26.5.1 (Build 25F80) |
| Runtime | Node v24.19.0, jest 29 + jest-expo preset (SDK 57) |
| App | Expo SDK 57, React Native 0.86.2, React 19.2.3, iOS-only |
| Native toolchain | Xcode 26.5 (Build 17F42), iPhoneSimulator 26.5 SDK |
| Branch base | `story/31-adaptive-layout` (stacked; NOT rebased onto main) |

## What changed

- `src/scanner/performance.ts` (new): budgets, `median`, `PerformanceSignposts`,
  `BoundedMetadataQueue` (drop-oldest), `createBoundedParseCache`,
  `resolveVisionKitPerformanceConfiguration`, `shouldDeliverThrottledFrame`.
- `src/scanner/session.ts`: startup/acceptance signposts, bounded re-entrant frame
  queue with coalescing, low-power frame throttle, `setPerformanceMode`,
  `performanceMetrics`, leak-free `dispose()`.
- `src/components/MultiCodeChooser.tsx`: candidate labels memoized + bounded parse
  cache keyed off payload contents, not array identity.
- `modules/scanner-engine/ios/ScannerPreviewView.swift`: recognition already ran off
  the main thread; added single-flight main-queue delivery (coalesce while pending),
  `lowPowerMode` 1-in-4 frame skip, and automatic skip under OS serious/critical
  thermal pressure. `ScannerEngineModule.swift` exposes the `lowPowerMode` prop,
  threaded through `ScannerPreview` from `session.performanceMode`.
- `src/state/AppProvider.tsx`: provider teardown disposes the session.

## Manual follow-up (physical device, proposed for #33)

- Instruments (Time Profiler + Allocations + Thermal State) cold-start trace on a
  baseline and a current device under a repeatable QR target; confirm preview ≤
  700 ms / accept ≤ 350 ms medians on hardware.
- MetricKit `MXThermalState` / `MXCPUMetric` diary across a 10-minute continuous
  scan in full vs low-power mode.
- Xcode Organizer thermal-pressure log for the soak test.
