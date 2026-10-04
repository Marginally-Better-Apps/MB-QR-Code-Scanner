import Foundation

/// The app's scene phase, without importing SwiftUI into Core.
enum AppPhase: Equatable {
  case active, inactive, background
}

enum CameraAuthorization: Equatable {
  case notDetermined, authorized, denied, restricted
}

/// What the capture device offers once access is granted.
struct CameraCapabilities: Equatable {
  var hasTorch: Bool
}

/// Wraps the system camera permission so scanner state can be tested without hardware.
@MainActor protocol CameraAuthorizing {
  var authorization: CameraAuthorization { get }
  /// Shows the system prompt when access is undetermined, then returns the new status.
  func requestAccess() async -> CameraAuthorization
  /// `nil` when no capture device exists.
  func capabilities() -> CameraCapabilities?
}

/// Haptics and VoiceOver announcements for accepted scans.
@MainActor protocol ScanFeedback {
  func scanAccepted()
  func announce(_ text: String)
}

/// Time source for scan bookkeeping and timeouts.
protocol ScannerClock {
  var now: Date { get }
  func sleep(for seconds: TimeInterval) async throws
}

struct SystemClock: ScannerClock {
  var now: Date { Date() }
  func sleep(for seconds: TimeInterval) async throws {
    try await Task.sleep(for: .seconds(seconds))
  }
}
