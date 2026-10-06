#if DEBUG || targetEnvironment(simulator)
import CoreGraphics
import Foundation

/// UI-test fixtures. Compiled only into Debug and Simulator builds; device Release builds always
/// use the camera. Values arrive as launch arguments (`-scannerFixture three-codes`), which
/// iOS exposes through `UserDefaults`.
@MainActor
enum LaunchFixtures {
  enum Key: String {
    /// Replaces the camera with fixed detections: `url` (default), `two-codes`, `three-codes`.
    case scannerFixture
    /// Decodes a bundled image through the real preview pipeline: `normal-qr`, `damaged-distant-qr`.
    case nativeImageFixture
    /// Seeds an empty History: `grouped`.
    case historyFixture
    /// Simulates camera permission: `authorized`, `denied`, `restricted`, `hardware-unavailable`.
    case cameraFixture
    /// Deterministic location boundary; History still persists and searches the real metadata.
    case locationFixture
  }

  static func value(_ key: Key, in defaults: UserDefaults = .standard) -> String? {
    defaults.string(forKey: key.rawValue)
  }

  static var scannerFixture: String? { value(.scannerFixture) }
  static var imageFixture: String? { value(.nativeImageFixture) }
  static var location: ScanLocating? { value(.locationFixture) == "chicago" ? FixtureLocation() : nil }

  /// The simulated scene for `scannerFixture`, or `nil` for the camera.
  static var simulatedScene: [Detection]? { scannerFixture.map(detections(named:)) }

  /// A camera stand-in when a fixture controls permission or replaces capture.
  static var camera: CameraAuthorizing? {
    if scannerFixture != nil || imageFixture != nil { return FixtureCamera(authorization: .authorized, hasCamera: true) }
    switch value(.cameraFixture) {
    case nil, "authorized": return nil
    case "restricted": return FixtureCamera(authorization: .restricted, hasCamera: true)
    case "hardware-unavailable": return FixtureCamera(authorization: .authorized, hasCamera: false)
    default: return FixtureCamera(authorization: .denied, hasCamera: true)
    }
  }

  static func detections(named name: String) -> [Detection] {
    let bounds = CGRect(x: 0.2, y: 0.3, width: 0.4, height: 0.2)
    switch name {
    case "three-codes":
      return [Detection("https://example.com/three-top", bounds: CGRect(x: 0.1, y: 0.15, width: 0.25, height: 0.12)), Detection("Hello middle code", bounds: CGRect(x: 0.55, y: 0.3, width: 0.25, height: 0.12)), Detection("myapp://pay?amount=10", bounds: CGRect(x: 0.2, y: 0.48, width: 0.25, height: 0.12))]
    case "two-codes": return [Detection("https://example.com/left", bounds: bounds), Detection("Hello from the right code", bounds: CGRect(x: 0.6, y: 0.3, width: 0.25, height: 0.15))]
    case "second": return [Detection("https://example.com/second", bounds: CGRect(x: 0.3, y: 0.35, width: 0.35, height: 0.18))]
    default: return [Detection("https://example.com/fixture", bounds: bounds)]
    }
  }

  /// Fills an empty History with rows spread over several days.
  static func seedHistoryIfRequested(_ history: HistoryRepository, now: Date = Date()) throws {
    guard value(.historyFixture) == "grouped", history.events.isEmpty else { return }
    let rows: [(String, TimeInterval)] = [
      ("https://example.com/today", 0), ("otpauth://totp/Example?secret=JBSWY3DPEHPK3PXP", 60),
      ("WIFI:T:WPA;S:Office;P:fixture;;", 86_400), ("https://example.com/yesterday", 86_460),
      ("Older note", 259_200), ("https://example.com/older", 345_600),
    ]
    for (payload, age) in rows {
      try history.record(ScanPayload(payload), at: now.addingTimeInterval(-age))
    }
  }
}

private struct FixtureCamera: CameraAuthorizing {
  let authorization: CameraAuthorization
  let hasCamera: Bool
  func requestAccess() async -> CameraAuthorization { authorization }
  func capabilities() -> CameraCapabilities? { hasCamera ? CameraCapabilities(hasTorch: false) : nil }
}

@MainActor private final class FixtureLocation: ScanLocating {
  var enabled = true
  func location(at date: Date) async -> ScanLocation? {
    guard enabled else { return nil }
    return ScanLocation(latitude: 41.8827, longitude: -87.6233,
      placeName: "Millennium Park, Chicago", capturedAt: date)
  }
}
#endif
