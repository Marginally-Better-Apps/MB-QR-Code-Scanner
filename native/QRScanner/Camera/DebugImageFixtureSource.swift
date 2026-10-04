#if DEBUG || targetEnvironment(simulator)
import UIKit

/// Debug and Simulator stand-in for the camera. A bundled image goes through the same
/// Vision path as live frames, and the frame repeats so acceptance and History behave
/// like live capture. Device Release builds always use the camera.
@MainActor
final class DebugImageFixtureSource {
  private static let names: Set = ["normal-qr", "damaged-distant-qr"]

  let imageView: UIImageView
  private let image: CGImage
  private let deliver: @MainActor (QRScanFrame?) -> Void
  private var frame: QRScanFrame?
  private var isRunning = false
  private var isDetecting = false
  /// Invalidates detection and repeats scheduled before the latest stop.
  private var generation = 0

  init?(named name: String, deliver: @escaping @MainActor (QRScanFrame?) -> Void) {
    guard
      Self.names.contains(name),
      let url = Bundle.main.url(forResource: name, withExtension: "png"),
      let uiImage = UIImage(contentsOfFile: url.path),
      let image = uiImage.cgImage
    else {
      return nil
    }
    let imageView = UIImageView(image: uiImage)
    imageView.backgroundColor = .black
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    self.imageView = imageView
    self.image = image
    self.deliver = deliver
  }

  func start() {
    isRunning = true
    if let frame {
      deliver(frame)
      return
    }
    guard !isDetecting else {
      return
    }
    isDetecting = true
    let generation = generation
    let image = image
    DispatchQueue.global(qos: .userInitiated).async {
      let frame = try? QRScanFrame.detect(in: image)
      DispatchQueue.main.async { [weak self] in
        self?.finishDetection(frame, generation: generation)
      }
    }
  }

  func stop() {
    isRunning = false
    isDetecting = false
    generation += 1
  }

  /// Projects the frame again, for example after the preview changes size.
  func redeliver() {
    if isRunning, let frame {
      deliver(frame)
    }
  }

  private func finishDetection(_ frame: QRScanFrame?, generation: Int) {
    guard isRunning, generation == self.generation else {
      return
    }
    isDetecting = false
    self.frame = frame
    deliver(frame)
    // Repeat the image frame to exercise acceptance and History, like live capture.
    for delay in [0.25, 1.0] {
      DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
        guard let self, isRunning, generation == self.generation else {
          return
        }
        deliver(frame)
      }
    }
  }
}
#endif
