import SwiftUI
import UIKit

enum AppTab: Hashable {
    case scanner
    case history
}

@MainActor
final class ScannerSessionStore: ObservableObject {
    @Published private(set) var cameraAccessState: CameraAccessState
    @Published private(set) var visibleObservations: [ScannerObservation] = []
    @Published private(set) var previewController: UIViewController?

    var isCameraActive: Bool {
        cameraAccessState == .ready
    }

    var usesCustomCameraGestures: Bool {
        (observationSource as? AVFoundationScannerObservationSource)?.usesCustomCameraGestures == true
    }

    private let cameraAccess: CameraAccessProviding
    private let observationSource: ScannerObservationSource
    private var isObservationSourceRunning = false
    private var scenePhase: ScannerLifecyclePhase = .active
    private var presentation: ScannerPresentation = .visible

    init(
        cameraAccess: CameraAccessProviding? = nil,
        observationSource: ScannerObservationSource? = nil
    ) {
        let cameraAccess = cameraAccess ?? CameraAccessProviderFactory.make()
        self.cameraAccess = cameraAccess
        self.observationSource = observationSource ?? ScannerObservationSourceFactory.make()
        cameraAccessState = CameraAccessState.resolve(
            authorization: cameraAccess.authorization,
            cameraAvailable: cameraAccess.cameraAvailable
        )
    }

    func activateScanner() async {
        refreshCameraAccess()

        guard cameraAccessState == .notDetermined else {
            updateObservationSourceActivity()
            return
        }

        await cameraAccess.requestAuthorization()
        refreshCameraAccess()
        updateObservationSourceActivity()
    }

    func resumeFromSettings() {
        cameraAccess.refreshAuthorization()
        refreshCameraAccess()
        updateObservationSourceActivity()
    }

    func handleLifecycle(_ phase: ScannerLifecyclePhase) {
        scenePhase = phase
        switch phase {
        case .background, .inactive:
            observationSource.handleLifecycle(phase)
        case .active:
            cameraAccess.refreshAuthorization()
            refreshCameraAccess()
            updateObservationSourceActivity()
            if shouldCapture {
                observationSource.handleLifecycle(.active)
            }
        }
    }

    func handlePresentation(_ presentation: ScannerPresentation) {
        self.presentation = presentation
        switch presentation {
        case .obscured:
            observationSource.handleLifecycle(.inactive)
        case .visible:
            updateObservationSourceActivity()
            if shouldCapture {
                observationSource.handleLifecycle(.active)
            }
        }
    }

    func handlePreviewLayoutChange() {
        (observationSource as? AVFoundationScannerObservationSource)?.handlePreviewLayoutChange()
    }

    func beginPinchZoom() {
        (observationSource as? AVFoundationScannerObservationSource)?.beginPinchZoom()
    }

    func updatePinchZoom(scale: CGFloat, atNormalizedPoint point: CGPoint, resultActionRect: CGRect?) {
        (observationSource as? AVFoundationScannerObservationSource)?.updatePinchZoom(
            scale: scale,
            atNormalizedPoint: point,
            resultActionRect: resultActionRect,
            onResultAction: {}
        )
    }

    func focus(atNormalizedPoint point: CGPoint, resultActionRect: CGRect?) {
        (observationSource as? AVFoundationScannerObservationSource)?.focus(
            atNormalizedPoint: point,
            resultActionRect: resultActionRect,
            onResultAction: {}
        )
    }

    private var shouldCapture: Bool {
        cameraAccessState == .ready && scenePhase == .active && presentation == .visible
    }

    private func refreshCameraAccess() {
        cameraAccessState = CameraAccessState.resolve(
            authorization: cameraAccess.authorization,
            cameraAvailable: cameraAccess.cameraAvailable
        )
    }

    private func updateObservationSourceActivity() {
        guard shouldCapture else {
            observationSource.stop()
            isObservationSourceRunning = false
            return
        }

        guard !isObservationSourceRunning else {
            return
        }

        isObservationSourceRunning = true
        observationSource.start { [weak self] frame in
            self?.visibleObservations = frame
        }
        previewController = observationSource.previewController
    }
}

@MainActor
final class AppState: ObservableObject {
    @Published var selectedTab: AppTab
    let scannerSession: ScannerSessionStore

    init(
        selectedTab: AppTab = .scanner,
        scannerSession: ScannerSessionStore? = nil
    ) {
        self.selectedTab = selectedTab
        self.scannerSession = scannerSession ?? ScannerSessionStore()
    }
}
