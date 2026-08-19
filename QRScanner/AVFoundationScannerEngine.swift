import AVFoundation
import CoreGraphics
import Foundation
import UIKit

struct AVFoundationRecognizedBarcode: Equatable {
    let payload: String?
    let bounds: CGRect
}

struct AVFoundationScannerConfiguration: Equatable {
    var metadataObjectTypes: [String]
    var recognitionRegion: CGRect
    var videoGravity: String
}

@MainActor
protocol AVFoundationScannerControlling: AnyObject {
    var isScanning: Bool { get }
    var viewSize: CGSize { get }
    var previewController: UIViewController? { get }
    var zoomFactor: CGFloat { get }
    var minZoomFactor: CGFloat { get }
    var maxZoomFactor: CGFloat { get }

    func startScanning() throws
    func stopScanning()
    func setZoomFactor(_ factor: CGFloat)
    func focus(atNormalizedPoint point: CGPoint)
    func updatePreviewLayout()
}

@MainActor
protocol AVFoundationScannerEventSink: AnyObject {
    func avFoundationScannerDidOutput(_ items: [AVFoundationRecognizedBarcode])
}

@MainActor
protocol AVFoundationScannerPlatform {
    var isAuthorized: Bool { get }

    func makeController(
        configuration: AVFoundationScannerConfiguration,
        eventSink: AVFoundationScannerEventSink
    ) -> AVFoundationScannerControlling
}

@MainActor
final class SystemAVFoundationScannerPlatform: AVFoundationScannerPlatform {
    private let authorizationOverride: CameraAuthorization?

    init(authorizationOverride: CameraAuthorization? = nil) {
        self.authorizationOverride = authorizationOverride
    }

    var isAuthorized: Bool {
        let authorization = authorizationOverride ?? SystemCameraAccessProvider().authorization
        return authorization == .authorized
    }

    func makeController(
        configuration: AVFoundationScannerConfiguration,
        eventSink: AVFoundationScannerEventSink
    ) -> AVFoundationScannerControlling {
        AVCaptureMetadataControllerBridge(
            configuration: configuration,
            eventSink: eventSink
        )
    }
}

@MainActor
final class AVFoundationScannerObservationSource: ScannerObservationSource, AVFoundationScannerEventSink {
    let engineID = ScannerEngineID("avfoundation")
    let usesCustomCameraGestures = true

    var previewController: UIViewController? { controller?.previewController }

    static let productMetadataObjectTypes = [AVMetadataObject.ObjectType.qr.rawValue]
    static let productConfiguration = AVFoundationScannerConfiguration(
        metadataObjectTypes: productMetadataObjectTypes,
        recognitionRegion: ScannerRecognitionRegion.fullPreview,
        videoGravity: ScannerPreviewPresentation.aspectFillGravity
    )

    private let platform: AVFoundationScannerPlatform
    private let clock: ScannerClock
    private var controller: AVFoundationScannerControlling?
    private var receiveFrame: (([ScannerObservation]) -> Void)?
    private var pinchBaseZoomFactor: CGFloat = 1

    init(
        platform: AVFoundationScannerPlatform? = nil,
        clock: ScannerClock = SystemScannerClock()
    ) {
        self.platform = platform ?? SystemAVFoundationScannerPlatform()
        self.clock = clock
    }

    func start(receiveFrame: @escaping ([ScannerObservation]) -> Void) {
        self.receiveFrame = receiveFrame
        startScanningIfPossible()
    }

    func stop() {
        receiveFrame = nil
        stopScanningIfNeeded()
    }

    func handleLifecycle(_ phase: ScannerLifecyclePhase) {
        switch phase {
        case .background, .inactive:
            stopScanningIfNeeded()
        case .active:
            startScanningIfPossible()
        }
    }

    func handlePreviewLayoutChange() {
        controller?.updatePreviewLayout()
    }

    func beginPinchZoom() {
        pinchBaseZoomFactor = controller?.zoomFactor ?? 1
    }

    func updatePinchZoom(
        scale: CGFloat,
        atNormalizedPoint point: CGPoint,
        resultActionRect: CGRect?,
        onResultAction: () -> Void
    ) {
        guard ScannerCameraInteractionRouter.hitTarget(at: point, resultActionRect: resultActionRect) == .camera else {
            return
        }

        let factor = ScannerCameraInteractionRouter.zoomFactor(
            base: pinchBaseZoomFactor,
            scale: scale,
            min: controller?.minZoomFactor ?? 1,
            max: controller?.maxZoomFactor ?? 1
        )
        controller?.setZoomFactor(factor)
    }

    func focus(
        atNormalizedPoint point: CGPoint,
        resultActionRect: CGRect?,
        onResultAction: () -> Void
    ) {
        switch ScannerCameraInteractionRouter.hitTarget(at: point, resultActionRect: resultActionRect) {
        case .resultAction:
            onResultAction()
        case .camera:
            controller?.focus(atNormalizedPoint: point)
        }
    }

    func avFoundationScannerDidOutput(_ items: [AVFoundationRecognizedBarcode]) {
        guard receiveFrame != nil, controller?.isScanning == true else {
            return
        }

        let timestamp = clock.now
        let viewSize = controller?.viewSize ?? .zero
        receiveFrame?(
            items.compactMap { item in
                ScannerObservationMapper.map(
                    payload: item.payload,
                    bounds: item.bounds,
                    viewSize: viewSize,
                    timestamp: timestamp,
                    engineID: engineID
                )
            }
        )
    }

    private func startScanningIfPossible() {
        guard receiveFrame != nil, platform.isAuthorized else {
            return
        }

        if controller == nil {
            controller = platform.makeController(
                configuration: Self.productConfiguration,
                eventSink: self
            )
        }

        guard controller?.isScanning != true else {
            return
        }

        try? controller?.startScanning()
    }

    private func stopScanningIfNeeded() {
        guard controller?.isScanning == true else {
            return
        }

        controller?.stopScanning()
    }
}

@MainActor
private final class AVCaptureMetadataControllerBridge: NSObject, AVFoundationScannerControlling, AVCaptureMetadataOutputObjectsDelegate {
    private let session = AVCaptureSession()
    private let previewViewController = AVCapturePreviewViewController()
    private let sessionQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.avfoundation.session")
    private let metadataQueue = DispatchQueue(label: "com.marginallybetter.qrscanner.avfoundation.metadata")
    private let configuration: AVFoundationScannerConfiguration
    private weak var eventSink: AVFoundationScannerEventSink?
    private var didConfigureSession = false
    private var captureDevice: AVCaptureDevice?
    private var pinchBaseZoomFactor: CGFloat = 1
    private(set) var isScanning = false

    var viewSize: CGSize { previewViewController.view.bounds.size }
    var previewController: UIViewController? { didConfigureSession ? previewViewController : nil }
    var zoomFactor: CGFloat { captureDevice?.videoZoomFactor ?? 1 }
    var minZoomFactor: CGFloat { captureDevice?.minAvailableVideoZoomFactor ?? 1 }
    var maxZoomFactor: CGFloat { captureDevice?.maxAvailableVideoZoomFactor ?? 1 }

    init(configuration: AVFoundationScannerConfiguration, eventSink: AVFoundationScannerEventSink) {
        self.configuration = configuration
        self.eventSink = eventSink
        super.init()
        previewViewController.previewLayer.session = session
        previewViewController.previewLayer.videoGravity = AVLayerVideoGravity(rawValue: configuration.videoGravity)
        previewViewController.onLayout = { [weak self] in
            self?.updatePreviewLayout()
        }
        previewViewController.onPinchBegan = { [weak self] in
            self?.pinchBaseZoomFactor = self?.zoomFactor ?? 1
        }
        previewViewController.onPinchChanged = { [weak self] scale in
            guard let self else {
                return
            }
            self.setZoomFactor(
                ScannerCameraInteractionRouter.zoomFactor(
                    base: self.pinchBaseZoomFactor,
                    scale: scale,
                    min: self.minZoomFactor,
                    max: self.maxZoomFactor
                )
            )
        }
        previewViewController.onTap = { [weak self] point in
            self?.focus(atNormalizedPoint: point)
        }
        configureSessionIfPossible()
    }

    func startScanning() throws {
        guard AVCaptureDevice.authorizationStatus(for: .video) == .authorized, didConfigureSession else {
            return
        }

        isScanning = true
        sessionQueue.async { [session] in
            guard !session.isRunning else {
                return
            }
            session.startRunning()
        }
    }

    func stopScanning() {
        isScanning = false
        sessionQueue.async { [session] in
            guard session.isRunning else {
                return
            }
            session.stopRunning()
        }
    }

    func setZoomFactor(_ factor: CGFloat) {
        sessionQueue.async { [weak self] in
            guard let self, let captureDevice = self.captureDevice, captureDevice.isConnected else {
                return
            }

            do {
                try captureDevice.lockForConfiguration()
                captureDevice.videoZoomFactor = min(
                    captureDevice.maxAvailableVideoZoomFactor,
                    max(captureDevice.minAvailableVideoZoomFactor, factor)
                )
                captureDevice.unlockForConfiguration()
            } catch {
                return
            }
        }
    }

    func focus(atNormalizedPoint point: CGPoint) {
        let layer = previewViewController.previewLayer
        let layerPoint = CGPoint(
            x: point.x * layer.bounds.width,
            y: point.y * layer.bounds.height
        )
        let devicePoint = layer.captureDevicePointConverted(fromLayerPoint: layerPoint)
        sessionQueue.async { [weak self] in
            guard let self, let captureDevice = self.captureDevice, captureDevice.isConnected else {
                return
            }

            do {
                try captureDevice.lockForConfiguration()
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
            } catch {
                return
            }
        }
    }

    func updatePreviewLayout() {
        if let connection = previewViewController.previewLayer.connection,
           connection.isVideoOrientationSupported
        {
            connection.videoOrientation = ScannerCaptureOrientation.videoOrientation(
                for: previewViewController.currentInterfaceOrientation
            )
        }
    }

    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        let previewLayer = previewViewController.previewLayer
        let barcodes = metadataObjects.compactMap { object -> AVFoundationRecognizedBarcode? in
            guard
                object.type == .qr,
                let code = object as? AVMetadataMachineReadableCodeObject
            else {
                return nil
            }

            let transformed = previewLayer.transformedMetadataObject(for: code) ?? code
            return AVFoundationRecognizedBarcode(
                payload: code.stringValue,
                bounds: transformed.bounds
            )
        }

        DispatchQueue.main.async { [weak self] in
            self?.eventSink?.avFoundationScannerDidOutput(barcodes)
        }
    }

    private func configureSessionIfPossible() {
        guard
            AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
            let camera = AVCaptureDevice.default(for: .video),
            let input = try? AVCaptureDeviceInput(device: camera),
            session.canAddInput(input)
        else {
            return
        }

        captureDevice = camera
        session.beginConfiguration()
        session.sessionPreset = .high
        session.addInput(input)

        let metadataOutput = AVCaptureMetadataOutput()
        guard session.canAddOutput(metadataOutput) else {
            session.commitConfiguration()
            return
        }

        session.addOutput(metadataOutput)
        metadataOutput.setMetadataObjectsDelegate(self, queue: metadataQueue)
        let requestedTypes = Set(configuration.metadataObjectTypes.compactMap(AVMetadataObject.ObjectType.init(rawValue:)))
        metadataOutput.metadataObjectTypes = metadataOutput.availableMetadataObjectTypes.filter(requestedTypes.contains)
        metadataOutput.rectOfInterest = configuration.recognitionRegion
        session.commitConfiguration()
        didConfigureSession = true
        updatePreviewLayout()
    }
}

private final class AVCapturePreviewViewController: UIViewController {
    let previewLayer = AVCaptureVideoPreviewLayer()
    var onLayout: (() -> Void)?
    var onPinchBegan: (() -> Void)?
    var onPinchChanged: ((CGFloat) -> Void)?
    var onTap: ((CGPoint) -> Void)?

    var currentInterfaceOrientation: UIInterfaceOrientation {
        view.window?.windowScene?.interfaceOrientation ?? .portrait
    }

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        view.accessibilityLabel = String(localized: "Live camera scan area")
        view.isAccessibilityElement = true

        let pinch = UIPinchGestureRecognizer(target: self, action: #selector(handlePinch))
        let tap = UITapGestureRecognizer(target: self, action: #selector(handleTap))
        view.addGestureRecognizer(pinch)
        view.addGestureRecognizer(tap)
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
        onLayout?()
    }

    override func viewWillTransition(to size: CGSize, with coordinator: UIViewControllerTransitionCoordinator) {
        super.viewWillTransition(to: size, with: coordinator)
        coordinator.animate { _ in
            self.onLayout?()
        }
    }

    @objc private func handlePinch(_ recognizer: UIPinchGestureRecognizer) {
        switch recognizer.state {
        case .began:
            onPinchBegan?()
        case .changed:
            onPinchChanged?(recognizer.scale)
        default:
            break
        }
    }

    @objc private func handleTap(_ recognizer: UITapGestureRecognizer) {
        let location = recognizer.location(in: view)
        guard view.bounds.width > 0, view.bounds.height > 0 else {
            return
        }
        onTap?(
            CGPoint(
                x: location.x / view.bounds.width,
                y: location.y / view.bounds.height
            )
        )
    }
}
