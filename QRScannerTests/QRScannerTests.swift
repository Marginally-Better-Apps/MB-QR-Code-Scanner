import XCTest
@testable import QRScanner

@MainActor
final class QRScannerTests: XCTestCase {
    func testFixtureSourceEmitsEngineNeutralObservationUsingInjectedClock() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_000)
        let clock = TestScannerClock(now: timestamp)
        let source = ScannerObservationFixtureSource(
            engineID: ScannerEngineID("fixture.unit"),
            clock: clock
        )
        var receivedFrames: [[ScannerObservation]] = []

        source.start { receivedFrames.append($0) }
        source.emit([
            ScannerFixtureDetection(
                rawPayload: "https://example.com/one",
                displayBounds: CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4)
            )
        ])

        XCTAssertEqual(
            receivedFrames,
            [[
                ScannerObservation(
                    rawPayload: "https://example.com/one",
                    displayBounds: CGRect(x: 0.1, y: 0.2, width: 0.3, height: 0.4),
                    timestamp: timestamp,
                    engineID: ScannerEngineID("fixture.unit")
                )
            ]]
        )
    }

    func testScannerSessionConsumesObservationProtocolFrames() async {
        let source = ScannerObservationFixtureSource(
            engineID: ScannerEngineID("fixture.session"),
            clock: TestScannerClock(now: Date(timeIntervalSince1970: 1_728_000_100))
        )
        let session = ScannerSessionStore(
            cameraAccess: CameraAccessStub(authorization: .authorized),
            observationSource: source
        )

        await session.activateScanner()
        source.emit([
            ScannerFixtureDetection(
                rawPayload: "replacement",
                displayBounds: CGRect(x: 0.4, y: 0.3, width: 0.2, height: 0.2)
            )
        ])

        XCTAssertEqual(session.visibleObservations.map(\.rawPayload), ["replacement"])

        source.emit([])

        XCTAssertTrue(session.visibleObservations.isEmpty)
    }

    func testNamedLaunchFixtureEmitsItsDeterministicObservation() {
        let timestamp = Date(timeIntervalSince1970: 1_728_000_200)
        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner", "--scanner-fixture", "single-code"],
            fixturesEnabled: true,
            clock: TestScannerClock(now: timestamp)
        )
        var receivedFrames: [[ScannerObservation]] = []

        source.start { receivedFrames.append($0) }

        XCTAssertEqual(source.engineID, ScannerEngineID("fixture.single-code"))
        XCTAssertEqual(receivedFrames.count, 1)
        XCTAssertEqual(receivedFrames[0].map(\.rawPayload), ["https://example.com/fixture"])
        XCTAssertEqual(receivedFrames[0].map(\.timestamp), [timestamp])
    }

    func testFixtureSourceDeterministicallyEmitsLossRepeatReplacementAndSimultaneousCodes() {
        let clock = TestScannerClock(now: Date(timeIntervalSince1970: 10))
        let engineID = ScannerEngineID("fixture.sequence")
        let source = ScannerObservationFixtureSource(engineID: engineID, clock: clock)
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        source.emit([detection("first")])
        clock.now = Date(timeIntervalSince1970: 11)
        source.emit([])
        clock.now = Date(timeIntervalSince1970: 12)
        source.emit([detection("first")])
        clock.now = Date(timeIntervalSince1970: 13)
        source.emit([detection("replacement")])
        clock.now = Date(timeIntervalSince1970: 14)
        source.emit([detection("left"), detection("right")])

        XCTAssertEqual(
            receivedFrames.map { $0.map(\.rawPayload) },
            [["first"], [], ["first"], ["replacement"], ["left", "right"]]
        )
        XCTAssertEqual(
            receivedFrames.flatMap { $0 }.map(\.timestamp),
            [10, 12, 13, 14, 14].map(Date.init(timeIntervalSince1970:))
        )
        XCTAssertTrue(receivedFrames.flatMap { $0 }.allSatisfy { $0.engineID == engineID })
    }

    func testFixtureModeIsIgnoredWhenBuildDoesNotAllowFixtures() {
        let defaults = UserDefaults(suiteName: #function)!
        defaults.set("single-code", forKey: "scannerFixture")
        defer { defaults.removePersistentDomain(forName: #function) }

        let source = ScannerObservationSourceFactory.make(
            arguments: ["QRScanner", "--scanner-fixture", "single-code"],
            defaults: defaults,
            fixturesEnabled: false
        )
        var receivedFrames: [[ScannerObservation]] = []
        source.start { receivedFrames.append($0) }

        XCTAssertEqual(source.engineID, ScannerEngineID("idle"))
        XCTAssertTrue(receivedFrames.isEmpty)
    }

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

    private func detection(_ rawPayload: String) -> ScannerFixtureDetection {
        ScannerFixtureDetection(
            rawPayload: rawPayload,
            displayBounds: CGRect(x: 0.1, y: 0.1, width: 0.2, height: 0.2)
        )
    }
}

private final class TestScannerClock: ScannerClock {
    var now: Date

    init(now: Date) {
        self.now = now
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
