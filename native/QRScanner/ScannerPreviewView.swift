import AVFoundation
import UIKit

final class ScannerPreviewView: UIView, AVCaptureVideoDataOutputSampleBufferDelegate {
  var onObservations: ([Detection]) -> Void = { _ in }
  var onPreviewReady: (Bool) -> Void = { _ in }

  var engineName = "avfoundation" {
    didSet { rebuildIfNeeded() }
  }

  var imageFixtureName: String? {
    didSet { rebuildIfNeeded() }
  }

  var running = false {
    didSet { updateRunning() }
  }

  /// QLT-04 thermal mitigation: when true, detection processes a subset of
  /// frames (~1 in 4) so a 10-minute continuous scan avoids high-rate Vision
  /// work that can be disabled. Updated from the native app's thermal state.
  var lowPowerMode = false {
    didSet { lowPowerFrameSkipCounter = 0 }
  }

  private let hostView = UIView()
  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var videoOutput: AVCaptureVideoDataOutput?
  private var captureDevice: AVCaptureDevice?
  private var fixtureImageView: UIImageView?
  private var fixtureImage: CGImage?
  private let sessionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.session")
  private let recognitionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.vision")
  private var pinchBaseZoomFactor: CGFloat = 1
  private var attachedConfiguration: String?
  private var pinchRecognizer: UIPinchGestureRecognizer?
  private var tapRecognizer: UITapGestureRecognizer?
  private var lastPreviewReady: Bool?
  private var fixtureDetectionGeneration = 0
  private var fixtureDetectionInFlight = false
  private var fixtureFrame: QRScanFrame?
  /// QLT-04: bounds the hop from the recognition queue to the main queue.
  /// While a delivery is pending, newer frames are coalesced (dropped) so
  /// metadata callbacks cannot build an unbounded main-queue backlog.
  private var mainDeliveryInFlight = false
  private var lowPowerFrameSkipCounter = 0
  private var lastThermalCheck = Date.distantPast
  private var thermalThrottling = false

  override init(frame: CGRect) {
    super.init(frame: frame)
    backgroundColor = .black
    clipsToBounds = true
    hostView.backgroundColor = .black
    hostView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hostView)

    // SwiftUI owns the scan-area accessibility label.
    isAccessibilityElement = false
  }

  required init?(coder: NSCoder) { fatalError("init(coder:) is unsupported") }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window != nil {
      rebuildIfNeeded()
      updateRunning()
    } else {
      stop()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostView.frame = bounds
    previewLayer?.frame = hostView.bounds
    fixtureImageView?.frame = hostView.bounds
    updateVideoOrientation()
    if running {
      start()
    }
  }

  private var configurationKey: String {
    "\(engineName):\(imageFixtureName ?? "camera")"
  }

  private func rebuildIfNeeded() {
    guard attachedConfiguration != configurationKey else {
      return
    }
    tearDown()
    attachedConfiguration = configurationKey
    if let imageFixtureName {
      attachImageFixture(named: imageFixtureName)
    } else {
      attachAVFoundation()
    }
    updateRunning()
  }

  private func updateRunning() {
    if running {
      start()
    } else {
      stop()
    }
  }

  private func start() {
    if attachedConfiguration == nil {
      rebuildIfNeeded()
    }
    if imageFixtureName != nil {
      startImageFixture()
    } else {
      startAVFoundation()
    }
  }

  private func notifyPreviewReady(_ ready: Bool) {
    if lastPreviewReady == ready {
      return
    }
    lastPreviewReady = ready
    onPreviewReady(ready)
  }

  private func startAVFoundation() {
    guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized else {
      notifyPreviewReady(false)
      return
    }

    // The native view can mount before the asynchronous permission request finishes.
    // Build the session again here so cold launch does not require a navigation cycle.
    if captureSession == nil || previewLayer == nil {
      attachAVFoundation()
    }
    guard let session = captureSession, previewLayer != nil else {
      notifyPreviewReady(false)
      return
    }

    sessionQueue.async { [weak self] in
      if !session.isRunning {
        session.startRunning()
      }
      DispatchQueue.main.async {
        guard let self, self.captureSession === session else {
          return
        }
        self.notifyPreviewReady(session.isRunning)
      }
    }
  }

  private func startImageFixture() {
    guard let fixtureImage else {
      notifyPreviewReady(false)
      return
    }
    notifyPreviewReady(true)
    if let fixtureFrame {
      onObservations(fixtureFrame.detections(previewSize: hostView.bounds.size))
      return
    }
    guard !fixtureDetectionInFlight else {
      return
    }
    fixtureDetectionInFlight = true
    let generation = fixtureDetectionGeneration
    recognitionQueue.async { [weak self] in
      let frame = try? QRScanFrame.detect(in: fixtureImage)
      DispatchQueue.main.async {
        guard
          let self,
          self.running,
          self.fixtureDetectionGeneration == generation,
          self.fixtureImageView != nil
        else {
          return
        }
        self.fixtureDetectionInFlight = false
        self.fixtureFrame = frame
        self.onObservations(frame?.detections(previewSize: self.hostView.bounds.size) ?? [])
        // Repeat the image frame to exercise acceptance and History, like live capture.
        for delay in [0.25, 1.0] {
          DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard
              let self,
              self.running,
              self.fixtureDetectionGeneration == generation
            else {
              return
            }
            self.onObservations(frame?.detections(previewSize: self.hostView.bounds.size) ?? [])
          }
        }
      }
    }
  }

  private func stop() {
    fixtureDetectionGeneration += 1
    fixtureDetectionInFlight = false
    sessionQueue.async { [captureSession] in
      if captureSession?.isRunning == true {
        captureSession?.stopRunning()
      }
    }
  }

  private func tearDown() {
    stop()
    mainDeliveryInFlight = false
    lowPowerFrameSkipCounter = 0
    previewLayer?.removeFromSuperlayer()
    previewLayer = nil
    videoOutput?.setSampleBufferDelegate(nil, queue: nil)
    videoOutput = nil
    captureSession = nil
    captureDevice = nil
    fixtureImageView?.removeFromSuperview()
    fixtureImageView = nil
    fixtureImage = nil
    fixtureDetectionInFlight = false
    fixtureFrame = nil
    lastPreviewReady = nil
    if let pinchRecognizer {
      removeGestureRecognizer(pinchRecognizer)
    }
    if let tapRecognizer {
      removeGestureRecognizer(tapRecognizer)
    }
    pinchRecognizer = nil
    tapRecognizer = nil
  }

  private func attachAVFoundation() {
    guard
      captureSession == nil,
      AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera)
    else {
      notifyPreviewReady(false)
      return
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    session.sessionPreset = .high
    guard session.canAddInput(input) else {
      session.commitConfiguration()
      notifyPreviewReady(false)
      return
    }
    session.addInput(input)

    let output = AVCaptureVideoDataOutput()
    output.alwaysDiscardsLateVideoFrames = true
    output.videoSettings = [
      kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32BGRA,
    ]
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      notifyPreviewReady(false)
      return
    }
    session.addOutput(output)
    output.setSampleBufferDelegate(self, queue: recognitionQueue)
    session.commitConfiguration()

    do {
      try camera.lockForConfiguration()
      defer { camera.unlockForConfiguration() }
      if camera.isFocusModeSupported(.continuousAutoFocus) {
        camera.focusMode = .continuousAutoFocus
      }
      if camera.isExposureModeSupported(.continuousAutoExposure) {
        camera.exposureMode = .continuousAutoExposure
      }
      camera.isSubjectAreaChangeMonitoringEnabled = true
    } catch {
      // The capture session can still scan with the camera's current settings.
    }

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = hostView.bounds
    hostView.layer.insertSublayer(layer, at: 0)
    captureSession = session
    previewLayer = layer
    videoOutput = output
    captureDevice = camera
    installAVFoundationGestures()
    updateVideoOrientation()
  }

  private func attachImageFixture(named name: String) {
    guard let image = loadFixtureImage(named: name), let cgImage = image.cgImage else {
      notifyPreviewReady(false)
      return
    }
    let imageView = UIImageView(image: image)
    imageView.backgroundColor = .black
    imageView.contentMode = .scaleAspectFill
    imageView.clipsToBounds = true
    imageView.frame = hostView.bounds
    imageView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    hostView.insertSubview(imageView, at: 0)
    fixtureImageView = imageView
    fixtureImage = cgImage
  }

  private func loadFixtureImage(named name: String) -> UIImage? {
    guard ["normal-qr", "damaged-distant-qr"].contains(name) else {
      return nil
    }
    let containingBundle = Bundle(for: ScannerPreviewView.self)
    for bundle in [containingBundle, Bundle.main] {
      if let resourceURL = bundle.url(
        forResource: "ScannerEngineResources",
        withExtension: "bundle"
      ), let resourceBundle = Bundle(url: resourceURL),
        let imageURL = resourceBundle.url(forResource: name, withExtension: "png"),
        let image = UIImage(contentsOfFile: imageURL.path)
      {
        return image
      }
      if let imageURL = bundle.url(forResource: name, withExtension: "png"),
        let image = UIImage(contentsOfFile: imageURL.path)
      {
        return image
      }
    }
    return nil
  }

  private func installAVFoundationGestures() {
    guard pinchRecognizer == nil else {
      return
    }
    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
    addGestureRecognizer(pinch)
    addGestureRecognizer(tap)
    pinchRecognizer = pinch
    tapRecognizer = tap
  }

  func captureOutput(
    _ output: AVCaptureOutput,
    didOutput sampleBuffer: CMSampleBuffer,
    from connection: AVCaptureConnection
  ) {
    guard running, let pixelBuffer = CMSampleBufferGetImageBuffer(sampleBuffer) else {
      return
    }
    // QLT-04: coalesce while the previous frame's delivery is still pending.
    // Detection already runs off the main thread on `recognitionQueue`; this
    // guard additionally bounds the main-queue backlog to one delivery.
    guard !mainDeliveryInFlight else {
      return
    }
    if shouldSkipFrameForThermalOrLowPower() {
      return
    }
    mainDeliveryInFlight = true
    let frame = try? QRScanFrame.detect(in: pixelBuffer)
    DispatchQueue.main.async { [weak self] in
      guard let self, self.running, self.previewLayer != nil else {
        self?.mainDeliveryInFlight = false
        return
      }
      defer { self.mainDeliveryInFlight = false }
      self.onObservations(frame?.detections(previewSize: self.hostView.bounds.size) ?? [])
    }
  }

  /// QLT-04: decides whether the current frame can skip detection. Skips when
  /// explicit low-power mode is on or when the OS reports serious/critical
  /// thermal pressure (checked at most every 5s to avoid syscall churn).
  /// Detection itself always runs on `recognitionQueue`, never on the
  /// render path; this only lowers its rate.
  private func shouldSkipFrameForThermalOrLowPower() -> Bool {
    let now = Date()
    if now.timeIntervalSince(lastThermalCheck) > 5 {
      lastThermalCheck = now
      let state = ProcessInfo.processInfo.thermalState
      thermalThrottling = (state == .serious || state == .critical)
    }
    guard lowPowerMode || thermalThrottling else {
      return false
    }
    lowPowerFrameSkipCounter += 1
    // ~1 in 4 frames at 30fps input ≈ 7.5fps detection rate.
    return lowPowerFrameSkipCounter % 4 != 1
  }

  private func updateVideoOrientation() {
    let angle: CGFloat
    switch window?.windowScene?.interfaceOrientation ?? .portrait {
    case .portrait:
      angle = 90
    case .portraitUpsideDown:
      angle = 270
    case .landscapeLeft:
      angle = 180
    case .landscapeRight:
      angle = 0
    default:
      angle = 90
    }
    for connection in [previewLayer?.connection, videoOutput?.connection(with: .video)] {
      if connection?.isVideoRotationAngleSupported(angle) == true {
        connection?.videoRotationAngle = angle
      }
    }
  }

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    guard imageFixtureName == nil, let captureDevice else {
      return
    }
    switch recognizer.state {
    case .began:
      pinchBaseZoomFactor = captureDevice.videoZoomFactor
    case .changed:
      let factor = min(
        captureDevice.maxAvailableVideoZoomFactor,
        max(captureDevice.minAvailableVideoZoomFactor, pinchBaseZoomFactor * recognizer.scale)
      )
      sessionQueue.async {
        try? captureDevice.lockForConfiguration()
        captureDevice.videoZoomFactor = factor
        captureDevice.unlockForConfiguration()
      }
    default:
      break
    }
  }

  @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
    guard imageFixtureName == nil, let previewLayer, let captureDevice else {
      return
    }
    let location = recognizer.location(in: self)
    guard bounds.width > 0, bounds.height > 0 else {
      return
    }
    let devicePoint = previewLayer.captureDevicePointConverted(fromLayerPoint: location)
    sessionQueue.async {
      guard captureDevice.isConnected else {
        return
      }
      try? captureDevice.lockForConfiguration()
      if captureDevice.isFocusPointOfInterestSupported {
        captureDevice.focusPointOfInterest = devicePoint
        if captureDevice.isFocusModeSupported(.autoFocus) {
          captureDevice.focusMode = .autoFocus
        }
      }
      if captureDevice.isExposurePointOfInterestSupported {
        captureDevice.exposurePointOfInterest = devicePoint
        if captureDevice.isExposureModeSupported(.autoExpose) {
          captureDevice.exposureMode = .autoExpose
        }
      }
      captureDevice.unlockForConfiguration()
    }
  }
}
