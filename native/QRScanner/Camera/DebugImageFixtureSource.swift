#if DEBUG || targetEnvironment(simulator)
import UIKit

/// Debug and Simulator stand-in for the camera. A bundled image goes through the same
/// Vision path as live frames, and the frame repeats while running so acceptance and History
/// behave like live capture. Device Release builds always use the camera.
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

  /// A bundled fixture name, or an absolute path to a photo on the Mac running Simulator (store screenshots).
  init?(named name: String, deliver: @escaping @MainActor (QRScanFrame?) -> Void) {
    let url = name.hasPrefix("/") ? URL(fileURLWithPath: name)
      : Self.names.contains(name) ? Bundle.main.url(forResource: name, withExtension: "png") : nil
    guard
      let url,
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
    if frame != nil {
      repeatFrame(generation: generation)
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
    repeatFrame(generation: generation)
  }

  /// Keeps delivering the frame like a camera held still, so acceptance, History, and the outline behave as live.
  private func repeatFrame(generation: Int) {
    guard isRunning, generation == self.generation else {
      return
    }
    deliver(frame)
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.25) { [weak self] in
      self?.repeatFrame(generation: generation)
    }
  }
}
#endif
