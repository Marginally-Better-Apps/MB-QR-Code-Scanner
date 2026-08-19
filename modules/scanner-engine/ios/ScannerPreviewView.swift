import AVFoundation
import ExpoModulesCore
import UIKit
import Vision
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

  private var visionKitController: DataScannerViewController?
  private var captureSession: AVCaptureSession?
  private var previewLayer: AVCaptureVideoPreviewLayer?
  private var captureDevice: AVCaptureDevice?
  private let sessionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.session")
  private let metadataQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.metadata")
  private var pinchBaseZoomFactor: CGFloat = 1
  private var attachedEngine: String?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    backgroundColor = .black
    clipsToBounds = true

    let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
    let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
    addGestureRecognizer(pinch)
    addGestureRecognizer(tap)
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
    previewLayer?.frame = bounds
    visionKitController?.view.frame = bounds
    updateVideoOrientation()
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
      guard DataScannerViewController.isSupported, DataScannerViewController.isAvailable else {
        onPreviewReady(["ready": false])
        return
      }
      try? visionKitController?.startScanning()
      onPreviewReady(["ready": visionKitController?.isScanning == true])
      return
    }

    guard
      AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let session = captureSession,
      previewLayer != nil
    else {
      onPreviewReady(["ready": false])
      return
    }
    sessionQueue.async {
      if !session.isRunning {
        session.startRunning()
      }
      DispatchQueue.main.async {
        self.onPreviewReady(["ready": true])
      }
    }
  }

  private func stop() {
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
  }

  private func attachVisionKit() {
    guard DataScannerViewController.isSupported else {
      onPreviewReady(["ready": false])
      return
    }
    let controller = DataScannerViewController(
      recognizedDataTypes: [.barcode(symbologies: [.qr])],
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
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    if controller.view.superview !== self {
      addSubview(controller.view)
    }
    if controller.parent == nil, let parent = nearestViewController() {
      parent.addChild(controller)
      controller.didMove(toParent: parent)
    }
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController {
        return controller
      }
      responder = current.next
    }
    return nil
  }

  private func attachAVFoundation() {
    guard
      AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
      let camera = AVCaptureDevice.default(for: .video),
      let input = try? AVCaptureDeviceInput(device: camera)
    else {
      onPreviewReady(["ready": false])
      return
    }

    let session = AVCaptureSession()
    session.beginConfiguration()
    session.sessionPreset = .high
    guard session.canAddInput(input) else {
      session.commitConfiguration()
      onPreviewReady(["ready": false])
      return
    }
    session.addInput(input)
    let output = AVCaptureMetadataOutput()
    guard session.canAddOutput(output) else {
      session.commitConfiguration()
      onPreviewReady(["ready": false])
      return
    }
    session.addOutput(output)
    output.setMetadataObjectsDelegate(self, queue: metadataQueue)
    output.metadataObjectTypes = output.availableMetadataObjectTypes.filter { $0 == .qr }
    output.rectOfInterest = CGRect(x: 0, y: 0, width: 1, height: 1)
    session.commitConfiguration()

    let layer = AVCaptureVideoPreviewLayer(session: session)
    layer.videoGravity = .resizeAspectFill
    layer.frame = bounds
    self.layer.addSublayer(layer)
    captureSession = session
    previewLayer = layer
    captureDevice = camera
    updateVideoOrientation()
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
    let viewSize = self.bounds.size
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
