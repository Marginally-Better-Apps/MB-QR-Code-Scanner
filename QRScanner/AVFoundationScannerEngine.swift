import AVFoundation
import CoreGraphics
import Foundation
import UIKit

struct AVFoundationRecognizedBarcode: Equatable {
    let payload: String?
    let bounds: CGRect
}

@MainActor
protocol AVFoundationScannerControlling: AnyObject {
    var isScanning: Bool { get }
    var viewSize: CGSize { get }
    var previewController: UIViewController? { get }

    func startScanning() throws
    func stopScanning()
}

@MainActor
protocol AVFoundationScannerEventSink: AnyObject {
    func avFoundationScannerDidOutput(_ items: [AVFoundationRecognizedBarcode])
}

@MainActor
protocol AVFoundationScannerPlatform {
    var isAuthorized: Bool { get }

    func makeController(
        metadataObjectTypes: [String],
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
        metadataObjectTypes: [String],
        eventSink: AVFoundationScannerEventSink
    ) -> AVFoundationScannerControlling {
        AVCaptureMetadataControllerBridge(
            metadataObjectTypes: metadataObjectTypes,
            eventSink: eventSink
        )
    }
}

@MainActor
final class AVFoundationScannerObservationSource: ScannerObservationSource, AVFoundationScannerEventSink {
    let engineID = ScannerEngineID("avfoundation")

    var previewController: UIViewController? { controller?.previewController }

    static let productMetadataObjectTypes = [AVMetadataObject.ObjectType.qr.rawValue]

    private let platform: AVFoundationScannerPlatform
    private let clock: ScannerClock
    private var controller: AVFoundationScannerControlling?
    private var receiveFrame: (([ScannerObservation]) -> Void)?

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
        case .background:
            stopScanningIfNeeded()
        case .active:
            startScanningIfPossible()
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
                guard let payload = item.payload else {
                    return nil
                }

                return ScannerObservation(
                    rawPayload: payload,
                    displayBounds: ScannerPreviewCoordinates.normalizedBounds(item.bounds, in: viewSize),
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
                metadataObjectTypes: Self.productMetadataObjectTypes,
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
    private weak var eventSink: AVFoundationScannerEventSink?
    private var didConfigureSession = false
    private(set) var isScanning = false

    var viewSize: CGSize { previewViewController.view.bounds.size }
    var previewController: UIViewController? { didConfigureSession ? previewViewController : nil }

    init(metadataObjectTypes: [String], eventSink: AVFoundationScannerEventSink) {
        self.eventSink = eventSink
        super.init()
        previewViewController.previewLayer.session = session
        configureSessionIfPossible(metadataObjectTypes: metadataObjectTypes)
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

    private func configureSessionIfPossible(metadataObjectTypes: [String]) {
        guard
            AVCaptureDevice.authorizationStatus(for: .video) == .authorized,
            let camera = AVCaptureDevice.default(for: .video),
            let input = try? AVCaptureDeviceInput(device: camera),
            session.canAddInput(input)
        else {
            return
        }

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
        let requestedTypes = Set(metadataObjectTypes.compactMap(AVMetadataObject.ObjectType.init(rawValue:)))
        metadataOutput.metadataObjectTypes = metadataOutput.availableMetadataObjectTypes.filter(requestedTypes.contains)
        session.commitConfiguration()
        didConfigureSession = true
    }
}

private final class AVCapturePreviewViewController: UIViewController {
    let previewLayer = AVCaptureVideoPreviewLayer()

    override func viewDidLoad() {
        super.viewDidLoad()
        view.backgroundColor = .black
        previewLayer.videoGravity = .resizeAspectFill
        view.layer.addSublayer(previewLayer)
        view.accessibilityLabel = String(localized: "Live camera scan area")
        view.isAccessibilityElement = true
    }

    override func viewDidLayoutSubviews() {
        super.viewDidLayoutSubviews()
        previewLayer.frame = view.bounds
    }
}
