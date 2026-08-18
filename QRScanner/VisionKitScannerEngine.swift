import CoreGraphics
import Foundation
import UIKit
import Vision
import VisionKit

struct VisionKitScannerConfiguration: Equatable {
    var barcodeSymbologies: [String]
    var recognizesMultipleItems: Bool
    var isHighFrameRateTrackingEnabled: Bool
    var isGuidanceEnabled: Bool
    var isHighlightingEnabled: Bool
}

struct VisionKitRecognizedBarcode: Equatable {
    let payload: String?
    let bounds: CGRect
}

@MainActor
protocol VisionKitScannerControlling: AnyObject {
    var isScanning: Bool { get }
    var viewSize: CGSize { get }
    var previewController: UIViewController? { get }

    func startScanning() throws
    func stopScanning()
}

@MainActor
protocol VisionKitScannerEventSink: AnyObject {
    func visionKitScannerDidAdd(_ items: [VisionKitRecognizedBarcode], allItems: [VisionKitRecognizedBarcode])
    func visionKitScannerDidUpdate(_ items: [VisionKitRecognizedBarcode], allItems: [VisionKitRecognizedBarcode])
    func visionKitScannerDidRemove(_ items: [VisionKitRecognizedBarcode], allItems: [VisionKitRecognizedBarcode])
}

@MainActor
protocol VisionKitScannerPlatform {
    var isSupported: Bool { get }
    var isAvailable: Bool { get }

    func makeController(
        configuration: VisionKitScannerConfiguration,
        eventSink: VisionKitScannerEventSink
    ) -> VisionKitScannerControlling
}

@MainActor
final class SystemVisionKitScannerPlatform: VisionKitScannerPlatform {
    var isSupported: Bool { DataScannerViewController.isSupported }
    var isAvailable: Bool { DataScannerViewController.isAvailable }

    func makeController(
        configuration: VisionKitScannerConfiguration,
        eventSink: VisionKitScannerEventSink
    ) -> VisionKitScannerControlling {
        let symbologies = configuration.barcodeSymbologies.compactMap(VNBarcodeSymbology.init(rawValue:))
        let controller = DataScannerViewController(
            recognizedDataTypes: [.barcode(symbologies: symbologies.isEmpty ? [.qr] : symbologies)],
            recognizesMultipleItems: configuration.recognizesMultipleItems,
            isHighFrameRateTrackingEnabled: configuration.isHighFrameRateTrackingEnabled,
            isGuidanceEnabled: configuration.isGuidanceEnabled,
            isHighlightingEnabled: configuration.isHighlightingEnabled
        )
        return DataScannerControllerBridge(controller: controller, eventSink: eventSink)
    }
}

@MainActor
final class VisionKitScannerObservationSource: ScannerObservationSource, VisionKitScannerEventSink {
    let engineID = ScannerEngineID("visionkit")

    var previewController: UIViewController? { controller?.previewController }

    private let platform: VisionKitScannerPlatform
    private let clock: ScannerClock
    private var controller: VisionKitScannerControlling?
    private var receiveFrame: (([ScannerObservation]) -> Void)?

    init(
        platform: VisionKitScannerPlatform? = nil,
        clock: ScannerClock = SystemScannerClock()
    ) {
        self.platform = platform ?? SystemVisionKitScannerPlatform()
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

    func visionKitScannerDidAdd(
        _ items: [VisionKitRecognizedBarcode],
        allItems: [VisionKitRecognizedBarcode]
    ) {
        publish(allItems)
    }

    func visionKitScannerDidUpdate(
        _ items: [VisionKitRecognizedBarcode],
        allItems: [VisionKitRecognizedBarcode]
    ) {
        publish(allItems)
    }

    func visionKitScannerDidRemove(
        _ items: [VisionKitRecognizedBarcode],
        allItems: [VisionKitRecognizedBarcode]
    ) {
        publish(allItems)
    }

    static let productConfiguration = VisionKitScannerConfiguration(
        barcodeSymbologies: [VNBarcodeSymbology.qr.rawValue],
        recognizesMultipleItems: true,
        isHighFrameRateTrackingEnabled: true,
        isGuidanceEnabled: false,
        isHighlightingEnabled: false
    )

    static func normalizedBounds(_ bounds: CGRect, in viewSize: CGSize) -> CGRect {
        ScannerPreviewCoordinates.normalizedBounds(bounds, in: viewSize)
    }

    static func boundingRect(
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

    private func startScanningIfPossible() {
        guard receiveFrame != nil, platform.isSupported, platform.isAvailable else {
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

    private func publish(_ allItems: [VisionKitRecognizedBarcode]) {
        guard receiveFrame != nil, controller?.isScanning == true else {
            return
        }

        let timestamp = clock.now
        let viewSize = controller?.viewSize ?? .zero
        receiveFrame?(
            allItems.compactMap { item in
                guard let payload = item.payload else {
                    return nil
                }

                return ScannerObservation(
                    rawPayload: payload,
                    displayBounds: Self.normalizedBounds(item.bounds, in: viewSize),
                    timestamp: timestamp,
                    engineID: engineID
                )
            }
        )
    }
}

@MainActor
private final class DataScannerControllerBridge: NSObject, VisionKitScannerControlling, DataScannerViewControllerDelegate {
    let controller: DataScannerViewController
    private weak var eventSink: VisionKitScannerEventSink?

    var isScanning: Bool { controller.isScanning }
    var viewSize: CGSize { controller.view.bounds.size }
    var previewController: UIViewController? { controller }

    init(controller: DataScannerViewController, eventSink: VisionKitScannerEventSink) {
        self.controller = controller
        self.eventSink = eventSink
        super.init()
        controller.delegate = self
    }

    func startScanning() throws {
        try controller.startScanning()
    }

    func stopScanning() {
        controller.stopScanning()
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didAdd addedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        eventSink?.visionKitScannerDidAdd(map(addedItems), allItems: map(allItems))
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didUpdate updatedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        eventSink?.visionKitScannerDidUpdate(map(updatedItems), allItems: map(allItems))
    }

    func dataScanner(
        _ dataScanner: DataScannerViewController,
        didRemove removedItems: [RecognizedItem],
        allItems: [RecognizedItem]
    ) {
        eventSink?.visionKitScannerDidRemove(map(removedItems), allItems: map(allItems))
    }

    private func map(_ items: [RecognizedItem]) -> [VisionKitRecognizedBarcode] {
        items.compactMap { item in
            guard case .barcode(let barcode) = item else {
                return nil
            }

            return VisionKitRecognizedBarcode(
                payload: barcode.payloadStringValue,
                bounds: VisionKitScannerObservationSource.boundingRect(
                    topLeft: barcode.bounds.topLeft,
                    topRight: barcode.bounds.topRight,
                    bottomRight: barcode.bounds.bottomRight,
                    bottomLeft: barcode.bounds.bottomLeft
                )
            )
        }
    }
}
