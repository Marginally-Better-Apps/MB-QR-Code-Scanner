import SwiftUI

enum AppTab: Hashable {
    case scanner
    case history
}

@MainActor
final class ScannerSessionStore: ObservableObject {
    @Published private(set) var cameraAccessState: CameraAccessState

    var isCameraActive: Bool {
        cameraAccessState == .ready
    }

    private let cameraAccess: CameraAccessProviding

    init(cameraAccess: CameraAccessProviding? = nil) {
        let cameraAccess = cameraAccess ?? CameraAccessProviderFactory.make()
        self.cameraAccess = cameraAccess
        cameraAccessState = CameraAccessState.resolve(
            authorization: cameraAccess.authorization,
            cameraAvailable: cameraAccess.cameraAvailable
        )
    }

    func activateScanner() async {
        refreshCameraAccess()

        guard cameraAccessState == .notDetermined else {
            return
        }

        await cameraAccess.requestAuthorization()
        refreshCameraAccess()
    }

    func resumeFromSettings() {
        cameraAccess.refreshAuthorization()
        refreshCameraAccess()
    }

    private func refreshCameraAccess() {
        cameraAccessState = CameraAccessState.resolve(
            authorization: cameraAccess.authorization,
            cameraAvailable: cameraAccess.cameraAvailable
        )
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
