import XCTest
@testable import QRScanner

@MainActor
final class QRScannerTests: XCTestCase {
    func testCameraPurposeStringPromisesOnDeviceRecognitionWithoutRetention() {
        XCTAssertEqual(
            Bundle.main.object(forInfoDictionaryKey: "NSCameraUsageDescription") as? String,
            "QR Scanner recognizes QR codes on this device. Camera frames are never uploaded or saved."
        )
    }

    func testCameraPurposeStringIsLocalizedInSpanish() throws {
        let url = try XCTUnwrap(
            Bundle.main.url(
                forResource: "InfoPlist",
                withExtension: "strings",
                subdirectory: nil,
                localization: "es"
            )
        )
        let strings = try XCTUnwrap(NSDictionary(contentsOf: url) as? [String: String])

        XCTAssertEqual(
            strings["NSCameraUsageDescription"],
            "QR Scanner reconoce códigos QR en este dispositivo. Los fotogramas de la cámara nunca se suben ni se guardan."
        )
    }

    func testCameraAccessStateMapsEveryAuthorizationAndHardwareState() {
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .notDetermined, cameraAvailable: true),
            .notDetermined
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .authorized, cameraAvailable: true),
            .ready
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .denied, cameraAvailable: true),
            .denied
        )
        XCTAssertEqual(
            CameraAccessState.resolve(authorization: .restricted, cameraAvailable: true),
            .restricted
        )

        for authorization in CameraAuthorization.allCases {
            XCTAssertEqual(
                CameraAccessState.resolve(authorization: authorization, cameraAvailable: false),
                .hardwareUnavailable
            )
        }
    }

    func testActivatingScannerRequestsUndeterminedAuthorizationInScannerContext() async {
        let cameraAccess = CameraAccessStub(
            authorization: .notDetermined,
            authorizationAfterRequest: .authorized
        )
        let session = ScannerSessionStore(cameraAccess: cameraAccess)

        XCTAssertEqual(session.cameraAccessState, .notDetermined)

        await session.activateScanner()

        XCTAssertEqual(cameraAccess.requestCount, 1)
        XCTAssertEqual(session.cameraAccessState, .ready)
        XCTAssertTrue(session.isCameraActive)
    }

    func testReturningFromSettingsRechecksAccessAndActivatesCamera() {
        let cameraAccess = CameraAccessStub(authorization: .denied)
        let session = ScannerSessionStore(cameraAccess: cameraAccess)

        XCTAssertEqual(session.cameraAccessState, .denied)
        XCTAssertFalse(session.isCameraActive)

        cameraAccess.authorization = .authorized
        session.resumeFromSettings()

        XCTAssertEqual(session.cameraAccessState, .ready)
        XCTAssertTrue(session.isCameraActive)
    }

    func testColdLaunchSelectsScanner() {
        let appState = AppState()

        XCTAssertEqual(appState.selectedTab, .scanner)
    }

    func testSwitchingTabsPreservesScannerSession() {
        let appState = AppState()
        let originalSession = appState.scannerSession

        appState.selectedTab = .history
        XCTAssertTrue(appState.scannerSession === originalSession)

        appState.selectedTab = .scanner
        XCTAssertTrue(appState.scannerSession === originalSession)
    }
}

@MainActor
private final class CameraAccessStub: CameraAccessProviding {
    var authorization: CameraAuthorization
    var cameraAvailable: Bool
    var requestCount = 0

    private let authorizationAfterRequest: CameraAuthorization

    init(
        authorization: CameraAuthorization,
        cameraAvailable: Bool = true,
        authorizationAfterRequest: CameraAuthorization? = nil
    ) {
        self.authorization = authorization
        self.cameraAvailable = cameraAvailable
        self.authorizationAfterRequest = authorizationAfterRequest ?? authorization
    }

    func requestAuthorization() async {
        requestCount += 1
        authorization = authorizationAfterRequest
    }
}
