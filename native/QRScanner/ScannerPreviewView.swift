import AVFoundation
import UIKit

/// Hosts the camera preview, or a Debug image fixture, plus pinch-to-zoom and tap-to-focus.
/// Capture runs in `CaptureController`; this view only forwards state changes to it.
final class ScannerPreviewView: UIView {
  var onObservations: ([Detection]) -> Void = { _ in }

  var imageFixtureName: String? {
    didSet {
      if imageFixtureName != oldValue { replaceSource() }
    }
  }

  var running = false {
    didSet {
      if running != oldValue { updateActivity() }
    }
  }

  var torchEnabled = false {
    didSet {
      if torchEnabled != oldValue { camera?.setTorch(torchEnabled) }
    }
  }

  override class var layerClass: AnyClass { AVCaptureVideoPreviewLayer.self }

  // `layerClass` guarantees this cast.
  private var previewLayer: AVCaptureVideoPreviewLayer { layer as! AVCaptureVideoPreviewLayer }

  private var camera: CaptureController?
  #if DEBUG || targetEnvironment(simulator)
  private var fixture: DebugImageFixtureSource?
  #endif
  private var rotationCoordinator: AVCaptureDevice.RotationCoordinator?
  private var rotationObservation: NSKeyValueObservation?
  private let focusIndicator = FocusIndicatorView()
  private lazy var pinchRecognizer = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
  private lazy var tapRecognizer = UITapGestureRecognizer(target: self, action: #selector(handleTap))
  /// Whether the current source was started. Changes only on real state transitions.
  private var isSourceActive = false
  /// Drops frames from a source that has since been replaced.
  private var sourceGeneration = 0
  private var lastLayoutSize = CGSize.zero

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    clipsToBounds = true
    previewLayer.videoGravity = .resizeAspectFill
    addSubview(focusIndicator)
    for recognizer in [pinchRecognizer, tapRecognizer] as [UIGestureRecognizer] {
      recognizer.isEnabled = false
      addGestureRecognizer(recognizer)
    }

    // SwiftUI owns the scan-area accessibility label.
    isAccessibilityElement = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    updateActivity()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    guard bounds.size != lastLayoutSize else {
      return
    }
    lastLayoutSize = bounds.size
    #if DEBUG || targetEnvironment(simulator)
    // A still image produces no new frames, so project it again for the new size.
    fixture?.redeliver()
    #endif
  }

  // MARK: Source lifecycle

  private var hasSource: Bool {
    #if DEBUG || targetEnvironment(simulator)
    if fixture != nil { return true }
    #endif
    return camera != nil
  }

  private func updateActivity() {
    let shouldRun = running && window != nil
    if shouldRun {
      attachSourceIfNeeded()
    }
    let active = shouldRun && hasSource
    guard active != isSourceActive else {
      return
    }
    isSourceActive = active
    #if DEBUG || targetEnvironment(simulator)
    if active { fixture?.start() } else { fixture?.stop() }
    #endif
    if active {
      camera?.start { [weak self] in self?.applyRotation() }
    } else {
      camera?.stop()
    }
  }

  private func replaceSource() {
    if isSourceActive {
      camera?.stop()
      #if DEBUG || targetEnvironment(simulator)
      fixture?.stop()
      #endif
      isSourceActive = false
    }
    sourceGeneration += 1
    camera = nil
    previewLayer.session = nil
    rotationObservation = nil
    rotationCoordinator = nil
    pinchRecognizer.isEnabled = false
    tapRecognizer.isEnabled = false
    focusIndicator.hide()
    #if DEBUG || targetEnvironment(simulator)
    fixture?.imageView.removeFromSuperview()
    fixture = nil
    #endif
    updateActivity()
  }

  private func attachSourceIfNeeded() {
    guard !hasSource else {
      return
    }
    let generation = sourceGeneration
    let deliver: @MainActor @Sendable (QRScanFrame?) -> Void = { [weak self] frame in
      self?.deliver(frame, generation: generation)
    }
    #if DEBUG || targetEnvironment(simulator)
    if let imageFixtureName {
      guard let fixture = DebugImageFixtureSource(named: imageFixtureName, deliver: deliver) else {
        return
      }
      fixture.imageView.frame = bounds
      insertSubview(fixture.imageView, at: 0)
      self.fixture = fixture
      return
    }
    #endif
    // The view can mount before the permission request finishes; the camera attaches on
    // the next start after authorization, so cold launch needs no navigation cycle.
    guard
      AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let camera = CaptureController(onFrame: deliver, onFocusReset: { [weak self] in self?.focusIndicator.hide() })
    else {
      return
    }
    self.camera = camera
    previewLayer.session = camera.session
    camera.setTorch(torchEnabled)
    observeRotation(of: camera.device)
    pinchRecognizer.isEnabled = true
    tapRecognizer.isEnabled = true
  }

  private func deliver(_ frame: QRScanFrame?, generation: Int) {
    guard isSourceActive, generation == sourceGeneration else {
      return
    }
    onObservations(frame?.detections(previewSize: bounds.size) ?? [])
  }

  // MARK: Rotation

  /// Follows the interface orientation, including 180° flips that cause no layout pass.
  private func observeRotation(of device: AVCaptureDevice) {
    let coordinator = AVCaptureDevice.RotationCoordinator(device: device, previewLayer: previewLayer)
    rotationObservation = coordinator.observe(\.videoRotationAngleForHorizonLevelPreview) { [weak self] _, _ in
      guard let self else { return }
      DispatchQueue.main.async { self.applyRotation() }
    }
    rotationCoordinator = coordinator
    applyRotation()
  }

  private func applyRotation() {
    guard let rotationCoordinator, let camera else {
      return
    }
    // Buffers use the preview angle, not the horizon-level capture angle, so Vision
    // bounds map straight onto what the preview shows even when the UI does not rotate.
    let angle = rotationCoordinator.videoRotationAngleForHorizonLevelPreview
    if let connection = previewLayer.connection, connection.isVideoRotationAngleSupported(angle) {
      connection.videoRotationAngle = angle
    }
    camera.setVideoRotationAngle(angle)
  }

  // MARK: Gestures

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    switch recognizer.state {
    case .began:
      camera?.beginZoom()
    case .changed:
      camera?.zoom(by: recognizer.scale)
    default:
      break
    }
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard let camera, bounds.width > 0, bounds.height > 0 else {
      return
    }
    let location = recognizer.location(in: self)
    focusIndicator.show(at: location)
    camera.focus(at: previewLayer.captureDevicePointConverted(fromLayerPoint: location))
  }
}
