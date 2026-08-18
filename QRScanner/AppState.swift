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

    private let cameraAccess: CameraAccessProviding
    private let observationSource: ScannerObservationSource
    private var isObservationSourceRunning = false

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
        switch phase {
        case .background:
            observationSource.handleLifecycle(.background)
        case .active:
            cameraAccess.refreshAuthorization()
            refreshCameraAccess()
            updateObservationSourceActivity()
            observationSource.handleLifecycle(.active)
        }
    }

    private func refreshCameraAccess() {
        cameraAccessState = CameraAccessState.resolve(
            authorization: cameraAccess.authorization,
            cameraAvailable: cameraAccess.cameraAvailable
        )
    }

    private func updateObservationSourceActivity() {
        guard cameraAccessState == .ready else {
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
