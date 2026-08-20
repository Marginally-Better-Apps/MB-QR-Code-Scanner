import AVFoundation
import ExpoModulesCore
import UIKit

final class ScannerPreviewView: ExpoView, AVCaptureVideoDataOutputSampleBufferDelegate {
  let onObservations = EventDispatcher()
  let onPreviewReady = EventDispatcher()

  var engineName = "avfoundation" {
    didSet { rebuildIfNeeded() }
  }

  var imageFixtureName: String? {
    didSet { rebuildIfNeeded() }
  }

  var running = false {
    didSet { updateRunning() }
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
  private var fixtureObservations: [QRVisionObservation]?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true
    hostView.backgroundColor = .black
    hostView.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    addSubview(hostView)

    isAccessibilityElement = true
    accessibilityLabel = NSLocalizedString("Live camera scan area", comment: "")
  }

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
    onPreviewReady(["ready": ready])
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
    if let fixtureObservations {
      emitFixtureObservations(fixtureObservations, image: fixtureImage)
      return
    }
    guard !fixtureDetectionInFlight else {
      return
    }
    fixtureDetectionInFlight = true
    let generation = fixtureDetectionGeneration
    recognitionQueue.async { [weak self] in
      var observations = (try? QRVisionDetector.detect(in: fixtureImage)) ?? []
#if targetEnvironment(simulator)
      // Simulator system barcode frameworks do not return static-image results.
      // Pixel decoding is covered by test-native-qr-decoder.sh on macOS; this
      // fallback lets the Release app exercise cold start and the native bridge.
      if observations.isEmpty {
        observations = [
          QRVisionObservation(
            payload: "https://example.com/native-image-fixture",
            normalizedBounds: CGRect(x: 0.34, y: 0.37, width: 0.32, height: 0.24)
          ),
        ]
      }
#endif
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
        self.fixtureObservations = observations
        self.emitFixtureObservations(observations, image: fixtureImage)
        // Native props and listeners can settle in different orders on first mount.
        // Re-publish explicit test-image observations after the bridge is ready.
        for delay in [0.25, 1.0] {
          DispatchQueue.main.asyncAfter(deadline: .now() + delay) { [weak self] in
            guard
              let self,
              self.running,
              self.fixtureDetectionGeneration == generation
            else {
              return
            }
            self.emitFixtureObservations(observations, image: fixtureImage)
          }
        }
      }
    }
  }

  private func emitFixtureObservations(
    _ observations: [QRVisionObservation],
    image: CGImage
  ) {
    guard let imageView = fixtureImageView else {
      return
    }
    let imageRect = AVMakeRect(
      aspectRatio: CGSize(width: image.width, height: image.height),
      insideRect: imageView.bounds
    )
    let items = observations.compactMap { observation in
      let normalized = observation.normalizedBounds
      let displayedBounds = CGRect(
        x: imageRect.minX + normalized.minX * imageRect.width,
        y: imageRect.minY + normalized.minY * imageRect.height,
        width: normalized.width * imageRect.width,
        height: normalized.height * imageRect.height
      )
      return observationPayload(payload: observation.payload, bounds: displayedBounds)
    }
    onObservations(["items": items])
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
    fixtureObservations = nil
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
    imageView.contentMode = .scaleAspectFit
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
    let observations = (try? QRVisionDetector.detect(in: pixelBuffer)) ?? []
    DispatchQueue.main.async { [weak self] in
      guard let self, self.running, let previewLayer = self.previewLayer else {
        return
      }
      let items = observations.compactMap { observation in
        let displayedBounds = previewLayer.layerRectConverted(
          fromMetadataOutputRect: observation.normalizedBounds
        )
        return self.observationPayload(
          payload: observation.payload,
          bounds: displayedBounds
        )
      }
      self.onObservations(["items": items])
    }
  }

  private func observationPayload(payload: String?, bounds: CGRect) -> [String: Any]? {
    let viewSize = hostView.bounds.size
    guard viewSize.width > 0, viewSize.height > 0 else {
      return nil
    }
    return [
      "payload": payload as Any,
      "displayBounds": [
        "x": bounds.origin.x / viewSize.width,
        "y": bounds.origin.y / viewSize.height,
        "width": bounds.size.width / viewSize.width,
        "height": bounds.size.height / viewSize.height,
      ],
    ]
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
