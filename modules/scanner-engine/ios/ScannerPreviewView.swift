import AVFoundation
import ExpoModulesCore
import UIKit
import VisionKit

final class ScannerPreviewView: ExpoView, DataScannerViewControllerDelegate, AVCaptureMetadataOutputObjectsDelegate {
  let onObservations = EventDispatcher()
  let onPreviewReady = EventDispatcher()

  var engineName = "avfoundation" {
    didSet { rebuildIfNeeded() }
  }

  var running = false {
    didSet { updateRunning() }
  }

  private let hostView = UIView()
  private var visionKitController: DataScannerViewController?
  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var captureDevice: AVCaptureDevice?
  private let sessionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.session")
  private let metadataQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.metadata")
  private var pinchBaseZoomFactor: CGFloat = 1
  private var attachedEngine: String?
  private var pinchRecognizer: UIPinchGestureRecognizer?
  private var tapRecognizer: UITapGestureRecognizer?
  private var lastPreviewReady: Bool?
  private var visionKitStartWorkItem: DispatchWorkItem?
  private var visionKitStartAttempts = 0

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
      if attachedEngine == nil {
        rebuildIfNeeded()
      } else {
        embedVisionKitIfNeeded()
      }
      updateRunning()
    } else {
      stop()
    }
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    hostView.frame = bounds
    previewLayer?.frame = hostView.bounds
    visionKitController?.view.frame = hostView.bounds
    updateVideoOrientation()
    if running {
      start()
    }
  }

  private func rebuildIfNeeded() {
    guard attachedEngine != engineName else {
      return
    }
    tearDown()
    attachedEngine = engineName
    if engineName == "visionkit" {
      attachVisionKit()
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
    if attachedEngine == nil {
      rebuildIfNeeded()
    }
    if engineName == "visionkit" {
      startVisionKit()
      return
    }
    startAVFoundation()
  }

  private func notifyPreviewReady(_ ready: Bool) {
    if lastPreviewReady == ready {
      return
    }
    lastPreviewReady = ready
    onPreviewReady(["ready": ready])
  }

  private func startVisionKit() {
    guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
      notifyPreviewReady(false)
      return
    }
    if visionKitController == nil {
      attachVisionKit()
    }
    embedVisionKitIfNeeded()
    guard
      let controller = visionKitController,
      window != nil,
      controller.parent != nil,
      controller.view.window != nil,
      bounds.width > 1,
      bounds.height > 1
    else {
      notifyPreviewReady(false)
      scheduleVisionKitStartRetry()
      return
    }
    if controller.isScanning {
      visionKitStartAttempts = 0
      notifyPreviewReady(true)
      return
    }
    do {
      try controller.startScanning()
      if controller.isScanning {
        visionKitStartAttempts = 0
        notifyPreviewReady(true)
      } else {
        notifyPreviewReady(false)
        scheduleVisionKitStartRetry()
      }
    } catch {
      notifyPreviewReady(false)
      scheduleVisionKitStartRetry()
    }
  }

  private func scheduleVisionKitStartRetry() {
    guard running, window != nil, visionKitStartAttempts < 12 else {
      return
    }
    visionKitStartWorkItem?.cancel()
    visionKitStartAttempts += 1
    let workItem = DispatchWorkItem { [weak self] in
      guard let self, self.running, self.engineName == "visionkit" else {
        return
      }
      self.startVisionKit()
    }
    visionKitStartWorkItem = workItem
    DispatchQueue.main.asyncAfter(deadline: .now() + 0.1, execute: workItem)
  }

  private func startAVFoundation() {
    guard
      AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let session = captureSession,
      previewLayer != nil
    else {
      notifyPreviewReady(false)
      return
    }
    sessionQueue.async {
      if !session.isRunning {
        session.startRunning()
      }
      DispatchQueue.main.async { [weak self] in
        guard let self, self.captureSession === session else {
          return
        }
        self.notifyPreviewReady(session.isRunning)
      }
    }
  }

  private func stop() {
    visionKitStartWorkItem?.cancel()
    visionKitStartWorkItem = nil
    visionKitStartAttempts = 0
    visionKitController?.stopScanning()
    sessionQueue.async { [captureSession] in
      if captureSession?.isRunning == true {
        captureSession?.stopRunning()
      }
    }
  }

  private func tearDown() {
    stop()
    visionKitController?.willMove(toParent: nil)
    visionKitController?.view.removeFromSuperview()
    visionKitController?.removeFromParent()
    visionKitController = nil
    previewLayer?.removeFromSuperlayer()
    previewLayer = nil
    captureSession = nil
    captureDevice = nil
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

  private func attachVisionKit() {
    guard DataScannerViewController.isSupported else {
      notifyPreviewReady(false)
      return
    }
    let controller = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
      qualityLevel: .accurate,
      recognizesMultipleItems: true,
      isHighFrameRateTrackingEnabled: true,
      isGuidanceEnabled: false,
      isHighlightingEnabled: false
    )
    controller.delegate = self
    visionKitController = controller
    embedVisionKitIfNeeded()
  }

  private func embedVisionKitIfNeeded() {
    guard let controller = visionKitController else {
      return
    }
    let parent = controller.parent ?? hostingViewController()
    let needsContainment = controller.parent == nil
    if needsContainment {
      parent?.addChild(controller)
    }
    controller.view.frame = hostView.bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    controller.view.backgroundColor = .black
    if controller.view.superview !== hostView {
      hostView.insertSubview(controller.view, at: 0)
    }
    hostView.sendSubviewToBack(controller.view)
    if needsContainment, parent != nil {
      controller.didMove(toParent: parent)
    }
  }

  private func hostingViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    var root = window?.rootViewController
    while let presented = root?.presentedViewController {
      root = presented
    }
    if let tabs = root as? UITabBarController {
      return tabs.selectedViewController ?? tabs
    }
    if let nav = root as? UINavigationController {
      return nav.visibleViewController ?? nav
    }
    return root
  }

  private func attachAVFoundation() {
    guard
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
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      notifyPreviewReady(false)
      return
    }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: metadataQueue)
    guard output.availableMetadataObjectTypes.contains(.qr) else {
      session.commitConfiguration()
      notifyPreviewReady(false)
      return
    }
    output.metadataObjectTypes = [.qr]
    output.rectOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
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
    captureDevice = camera
    installAVFoundationGestures()
    updateVideoOrientation()
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

  func dataScanner(
    _ dataScanner: DataScannerViewController,
    didAdd addedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    emitVisionKit(allItems)
  }

  func dataScanner(
    _ dataScanner: DataScannerViewController,
    didUpdate updatedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    emitVisionKit(allItems)
  }

  func dataScanner(
    _ dataScanner: DataScannerViewController,
    didRemove removedItems: [RecognizedItem],
    allItems: [RecognizedItem]
  ) {
    emitVisionKit(allItems)
  }

  func metadataOutput(
    _ output: AVCaptureMetadataOutput,
    didOutput metadataObjects: [AVMetadataObject],
    from connection: AVCaptureConnection
  ) {
    guard let previewLayer else {
      return
    }
    let items: [[String: Any]] = metadataObjects.compactMap { object in
      guard
        object.type == .qr,
        let code = object as? AVMetadataMachineReadableCodeObject
      else {
        return nil
      }
      let transformed = previewLayer.transformedMetadataObject(for: code) ?? code
      return observationPayload(payload: code.stringValue, bounds: transformed.bounds)
    }
    DispatchQueue.main.async {
      self.onObservations(["items": items])
    }
  }

  private func emitVisionKit(_ items: [RecognizedItem]) {
    let mapped: [[String: Any]] = items.compactMap { item in
      guard case .barcode(let barcode) = item else {
        return nil
      }
      let bounds = boundingRect(
        topLeft: barcode.bounds.topLeft,
        topRight: barcode.bounds.topRight,
        bottomRight: barcode.bounds.bottomRight,
        bottomLeft: barcode.bounds.bottomLeft
      )
      return observationPayload(payload: barcode.payloadStringValue, bounds: bounds)
    }
    onObservations(["items": mapped])
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

  private func boundingRect(
    topLeft: CGPoint,
    topRight: CGPoint,
    bottomRight: CGPoint,
    bottomLeft: CGPoint
  ) -> CGRect {
    let minX = min(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x)
    let maxX = max(topLeft.x, topRight.x, bottomRight.x, bottomLeft.x)
    let minY = min(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y)
    let maxY = max(topLeft.y, topRight.y, bottomRight.y, bottomLeft.y)
    return CGRect(x: minX, y: minY, width: maxX - minX, height: maxY - minY)
  }

  private func updateVideoOrientation() {
    guard let connection = previewLayer?.connection else {
      return
    }
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
    if connection.isVideoRotationAngleSupported(angle) {
      connection.videoRotationAngle = angle
    }
  }

  @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
    guard engineName != "visionkit", let captureDevice else {
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
    guard engineName != "visionkit", let previewLayer, let captureDevice else {
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
