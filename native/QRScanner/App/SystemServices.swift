import AVFoundation
import UIKit

/// The system camera permission and capture device.
struct SystemCameraAuthorizer: CameraAuthorizing {
  var authorization: CameraAuthorization {
    switch AVCaptureDevice.authorizationStatus(for: .video) {
    case .authorized: .authorized
    case .denied: .denied
    case .restricted: .restricted
    case .notDetermined: .notDetermined
    @unknown default: .denied
    }
  }

  func requestAccess() async -> CameraAuthorization {
    _ = await AVCaptureDevice.requestAccess(for: .video)
    return authorization
  }

  func capabilities() -> CameraCapabilities? {
    AVCaptureDevice.default(for: .video).map { CameraCapabilities(hasTorch: $0.hasTorch) }
  }
}

/// A light tap for each accepted frame and a VoiceOver announcement for each new code.
struct SystemScanFeedback: ScanFeedback {
  func scanAccepted() { UIImpactFeedbackGenerator(style: .light).impactOccurred() }
  func announce(_ text: String) { UIAccessibility.post(notification: .announcement, argument: text) }
}
